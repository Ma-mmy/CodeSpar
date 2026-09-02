package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.ai.ChatModelFactory;
import com.codespar.ai.GenerationEventHub;
import com.codespar.ai.LenientJsonParser;
import com.codespar.ai.PromptBuilder;
import com.codespar.ai.QuestionBatchDTO;
import com.codespar.mapper.ArticleMapper;
import com.codespar.mapper.ExamMapper;
import com.codespar.mapper.ExamQuestionMapper;
import com.codespar.mapper.GenerationBatchMapper;
import com.codespar.mapper.GenerationJobMapper;
import com.codespar.mapper.QuestionMapper;
import com.codespar.mapper.QuestionTagMapper;
import com.codespar.mapper.TagMapper;
import com.codespar.mapper.WrongQuestionMapper;
import com.codespar.model.dto.GenerationDTO;
import com.codespar.model.dto.GenerationDTO.BatchResultView;
import com.codespar.model.dto.GenerationDTO.GenerateParams;
import com.codespar.model.dto.GenerationDTO.GenerateRequest;
import com.codespar.model.dto.GenerationDTO.GenerationView;
import com.codespar.model.dto.GenerationDTO.OptimizeRequest;
import com.codespar.model.dto.GenerationDTO.OptimizeResult;
import com.codespar.model.dto.GenerationDTO.QuestionView;
import com.codespar.model.entity.Article;
import com.codespar.model.entity.Exam;
import com.codespar.model.entity.ExamQuestion;
import com.codespar.model.entity.GenerationBatch;
import com.codespar.model.entity.GenerationJob;
import com.codespar.model.entity.ModelProfile;
import com.codespar.model.entity.Question;
import com.codespar.model.entity.Tag;
import com.codespar.model.enums.DedupStrength;
import com.codespar.model.enums.QuestionType;
import com.codespar.service.QuestionSaver.QuestionDraft;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * 出题编排（P3 心脏）：
 * 按题型分批并发调模型 → 宽松解析 → 业务校验 → 失败回灌重试 → 进度经 SSE 推送 →
 * DRAFT 题目入库 → 预览确认后组卷。
 */
@Slf4j
@Service
public class GenerationService {

    private static final Set<String> TERMINAL = Set.of("SUCCESS", "PARTIAL", "FAILED", "CANCELLED");

    private final GenerationJobMapper jobMapper;
    private final GenerationBatchMapper batchMapper;
    private final QuestionMapper questionMapper;
    private final TagMapper tagMapper;
    private final QuestionTagMapper questionTagMapper;
    private final ExamMapper examMapper;
    private final ExamQuestionMapper examQuestionMapper;
    private final WrongQuestionMapper wrongQuestionMapper;
    private final ArticleMapper articleMapper;
    private final QuestionConverter converter;
    private final QuestionSaver questionSaver;
    private final QuestionTaggingService tagging;
    private final ChatModelFactory modelFactory;
    private final ModelProfileService modelService;
    private final CategoryService categoryService;
    private final PromptBuilder promptBuilder;
    private final LenientJsonParser jsonParser;
    private final GenerationEventHub hub;
    private final ObjectMapper objectMapper;
    private final ExecutorService generationExecutor;
    private final TransactionTemplate transactionTemplate;

    private final ConcurrentHashMap<Long, Boolean> cancelFlags = new ConcurrentHashMap<>();
    private final Semaphore concurrencyGate;

    @Value("${codespar.generation.max-questions-per-exam:30}")
    private int maxQuestions;
    @Value("${codespar.generation.max-parse-retries:2}")
    private int maxParseRetries;

    public GenerationService(GenerationJobMapper jobMapper,
                             GenerationBatchMapper batchMapper,
                             QuestionMapper questionMapper,
                             TagMapper tagMapper,
                             QuestionTagMapper questionTagMapper,
                             ExamMapper examMapper,
                             ExamQuestionMapper examQuestionMapper,
                             WrongQuestionMapper wrongQuestionMapper,
                             ArticleMapper articleMapper,
                             QuestionConverter converter,
                             QuestionSaver questionSaver,
                             QuestionTaggingService tagging,
                             ChatModelFactory modelFactory,
                             ModelProfileService modelService,
                             CategoryService categoryService,
                             PromptBuilder promptBuilder,
                             LenientJsonParser jsonParser,
                             GenerationEventHub hub,
                             ObjectMapper objectMapper,
                             ExecutorService generationExecutor,
                             PlatformTransactionManager transactionManager,
                             @Value("${codespar.generation.batch-concurrency:4}") int batchConcurrency) {
        this.jobMapper = jobMapper;
        this.batchMapper = batchMapper;
        this.questionMapper = questionMapper;
        this.tagMapper = tagMapper;
        this.questionTagMapper = questionTagMapper;
        this.examMapper = examMapper;
        this.examQuestionMapper = examQuestionMapper;
        this.wrongQuestionMapper = wrongQuestionMapper;
        this.articleMapper = articleMapper;
        this.converter = converter;
        this.questionSaver = questionSaver;
        this.tagging = tagging;
        this.modelFactory = modelFactory;
        this.modelService = modelService;
        this.categoryService = categoryService;
        this.promptBuilder = promptBuilder;
        this.jsonParser = jsonParser;
        this.hub = hub;
        this.objectMapper = objectMapper;
        this.generationExecutor = generationExecutor;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.concurrencyGate = new Semaphore(batchConcurrency);
    }

    /* ========================================================== 对外入口 */

    /** 创建出题任务并异步开跑，返回 jobId。 */
    public Long create(GenerateRequest req) {
        int total = req.getCounts().values().stream()
                .filter(Objects::nonNull).mapToInt(Integer::intValue).sum();
        if (total <= 0) {
            throw new BizException("请至少设置一种题型且数量大于 0");
        }
        if (total > maxQuestions) {
            throw new BizException("一次出题最多 " + maxQuestions + " 道，当前 " + total + " 道");
        }
        for (var e : req.getCounts().entrySet()) {
            int v = e.getValue() == null ? 0 : e.getValue();
            if (v < 0) {
                throw new BizException("题型数量不能为负数：" + e.getKey());
            }
        }
        ModelProfile model = modelService.getRequired(req.getModelProfileId());
        if (!Boolean.TRUE.equals(model.getCanGenerate())) {
            throw new BizException("该模型未启用「可用于出题」，请到模型管理开启");
        }
        String categoryCode = categoryService.requireExistingOrNull(req.getCategory());
        req.setCategory(categoryCode);
        Long articleId = req.getArticleId();
        if (articleId != null) {
            Article article = articleMapper.selectById(articleId);
            if (article == null) {
                throw new BizException("关联文章不存在：" + articleId);
            }
            if (!"READY".equals(article.getSummaryStatus()) && !"STALE".equals(article.getSummaryStatus())) {
                throw new BizException("文章考点摘要未就绪，请先完成提炼后再出题");
            }
            if (article.getSummaryMd() == null || article.getSummaryMd().isBlank()) {
                throw new BizException("文章考点摘要为空，请重新提炼后再出题");
            }
        }

        GenerationJob job = new GenerationJob();
        job.setPrompt(req.getPrompt().trim());
        job.setCategory(categoryCode);
        job.setArticleId(articleId);
        job.setParamsJson(toJson(GenerateParams.from(req)));
        job.setModelProfileId(model.getId());
        job.setModelSnapshot(model.getName());
        job.setStatus("RUNNING");
        job.setRequestedCount(total);
        job.setGeneratedCount(0);
        job.setPromptTokens(0);
        job.setCompletionTokens(0);
        job.setCostMs(0L);
        jobMapper.insert(job);

        generationExecutor.execute(() -> run(job.getId()));
        return job.getId();
    }

    public List<GenerationView> list() {
        return jobMapper.selectList(Wrappers.<GenerationJob>lambdaQuery()
                        .orderByDesc(GenerationJob::getId)
                        .last("LIMIT 50"))
                .stream().map(j -> toView(j, false)).toList();
    }

    public GenerationView detail(Long id) {
        return toView(getRequired(id), true);
    }

    /**
     * 用相同参数再来一次（P6）：复制 prompt + params，自动带去重（沿用原 dedupStrength）。
     * 立即创建新任务并异步开跑，返回新 jobId。
     */
    public Long rerun(Long jobId) {
        GenerationJob src = getRequired(jobId);
        GenerateParams params = parseParams(src);
        GenerateRequest req = new GenerateRequest();
        req.setPrompt(src.getPrompt());
        req.setCounts(params.getCounts() == null ? Map.of() : params.getCounts());
        req.setDifficulty(params.getDifficulty() == null
                ? com.codespar.model.enums.QuestionDifficulty.INTERMEDIATE
                : params.getDifficulty());
        req.setTags(params.getTags());
        String category = params.getCategory();
        if (category == null || category.isBlank()) {
            category = src.getCategory();
        }
        req.setCategory(category);
        // 优先用快照里的 modelProfileId；若配置已删则回退到 job 上的 id
        Long modelId = params.getModelProfileId() != null ? params.getModelProfileId() : src.getModelProfileId();
        req.setModelProfileId(modelId);
        req.setLanguage(params.getLanguage() == null ? "zh" : params.getLanguage());
        req.setDedupStrength(params.getDedupStrength() == null
                ? DedupStrength.STANDARD
                : params.getDedupStrength());
        req.setArticleId(src.getArticleId());
        req.setAutoOptimize(params.getAutoOptimize() == null || Boolean.TRUE.equals(params.getAutoOptimize()));
        return create(req);
    }

    /**
     * 仅优化出题描述（同步），使用设置里的 optimize 系统提示词槽位。
     * 供出题页「优化描述」按钮回填表单。
     */
    public OptimizeResult optimizeOnly(OptimizeRequest req) {
        ModelProfile modelProfile = modelService.getRequired(req.getModelProfileId());
        if (!Boolean.TRUE.equals(modelProfile.getCanGenerate())) {
            throw new BizException("该模型未启用「可用于出题」，请到设置开启");
        }
        String categoryCode = categoryService.requireExistingOrNull(req.getCategory());
        if (req.getArticleId() != null) {
            Article article = articleMapper.selectById(req.getArticleId());
            if (article == null) {
                throw new BizException("关联文章不存在：" + req.getArticleId());
            }
            if (!"READY".equals(article.getSummaryStatus()) && !"STALE".equals(article.getSummaryStatus())) {
                throw new BizException("文章考点摘要未就绪，请先完成提炼");
            }
        }

        GenerateParams params = new GenerateParams();
        params.setCounts(req.getCounts() == null ? Map.of() : req.getCounts());
        params.setDifficulty(req.getDifficulty() == null
                ? com.codespar.model.enums.QuestionDifficulty.INTERMEDIATE
                : req.getDifficulty());
        params.setTags(req.getTags());
        params.setCategory(categoryCode);
        params.setModelProfileId(req.getModelProfileId());
        params.setLanguage(req.getLanguage() == null ? "zh" : req.getLanguage());

        String effective = withArticleSummary(req.getPrompt().trim(), req.getArticleId());
        String countsBlock = buildCountsBlock(params);
        String optimizePrompt = promptBuilder.buildOptimize(effective, params, countsBlock);

        ChatModel model = modelFactory.get(modelProfile);
        long start = System.nanoTime();
        ChatResponse resp = callModel(model, optimizePrompt);
        String optimized = extractText(resp);
        if (optimized == null || optimized.isBlank()) {
            throw new BizException("模型返回空的优化结果");
        }
        if (optimized.startsWith("```")) {
            int first = optimized.indexOf('\n');
            int last = optimized.lastIndexOf("```");
            if (first > 0 && last > first) {
                optimized = optimized.substring(first + 1, last).trim();
            }
        }
        Usage usage = resp.getMetadata() == null ? null : resp.getMetadata().getUsage();
        int promptTokens = usage == null || usage.getPromptTokens() == null ? 0 : usage.getPromptTokens();
        int completionTokens = usage == null || usage.getCompletionTokens() == null ? 0 : usage.getCompletionTokens();
        return OptimizeResult.of(optimized, promptTokens, completionTokens, elapsedMs(start));
    }

    public GenerationJob getRequired(Long id) {
        GenerationJob job = jobMapper.selectById(id);
        if (job == null) {
            throw new BizException("出题任务不存在：" + id);
        }
        return job;
    }

    public List<QuestionView> questions(Long jobId) {
        getRequired(jobId);
        return questionMapper.selectByJobId(jobId).stream()
                .map(q -> converter.toView(q, tagging.namesOf(q.getId())))
                .toList();
    }

    public List<BatchResultView> batches(Long jobId) {
        getRequired(jobId);
        return batchMapper.selectByJobId(jobId).stream().map(b -> {
            BatchResultView v = new BatchResultView();
            v.setType(b.getBatchType());
            v.setStatus(b.getStatus());
            v.setRequestedCount(b.getRequestedCount());
            v.setGeneratedCount(b.getGeneratedCount());
            v.setErrorMsg(b.getErrorMsg());
            v.setRawOutput(b.getRawOutput());
            return v;
        }).toList();
    }

    /** 中途取消：置标志，各批在调模型前检查；已完成的题目保留为草稿。 */
    public void cancel(Long id) {
        GenerationJob job = getRequired(id);
        if (!"RUNNING".equals(job.getStatus())) {
            return;
        }
        cancelFlags.put(id, true);
    }

    /**
     * 删除出题历史：批次 + 未入卷题目一并删；已组进试卷的题目保留。
     * 进行中的任务先取消再删。
     */
    public void delete(Long jobId) {
        GenerationJob job = getRequired(jobId);
        if ("RUNNING".equals(job.getStatus())) {
            cancelFlags.put(jobId, true);
            GenerationJob update = new GenerationJob();
            update.setId(jobId);
            update.setStatus("CANCELLED");
            jobMapper.updateById(update);
        }
        transactionTemplate.executeWithoutResult(status -> deleteOnce(jobId));
        cancelFlags.remove(jobId);
        hub.complete(jobId);
        hub.remove(jobId);
    }

    private void deleteOnce(Long jobId) {
        List<Question> questions = questionMapper.selectByJobId(jobId);
        for (Question q : questions) {
            boolean usedInExam = examQuestionMapper.countByQuestionId(q.getId()) > 0;
            if ("DRAFT".equals(q.getStatus()) || !usedInExam) {
                tagging.delete(q.getId());
                wrongQuestionMapper.deleteByQuestionId(q.getId());
                questionMapper.deleteById(q.getId());
            }
        }
        examMapper.update(null, Wrappers.<Exam>lambdaUpdate()
                .eq(Exam::getJobId, jobId)
                .set(Exam::getJobId, null));
        batchMapper.deleteByJobId(jobId);
        jobMapper.deleteById(jobId);
    }

    /** 单批重试（PARTIAL/FAILED 的任务）。按「还缺几道」补生成，支持删过题的补齐。异步执行。 */
    public void retryBatch(Long jobId, QuestionType type) {
        GenerationJob job = getRequired(jobId);
        if ("RUNNING".equals(job.getStatus())) {
            throw new BizException("任务还在生成中");
        }
        GenerationBatch batch = batchMapper.selectByJobAndType(jobId, type);
        if (batch == null) {
            throw new BizException("没有该题型批次：" + type);
        }
        // 同步置回 RUNNING：让前端重开流时能续接进度，而不是读到终态直接 done
        jobMapper.updateStatus(jobId, "RUNNING");
        generationExecutor.execute(() -> doRetryBatch(jobId, type, job, batch));
    }

    private void doRetryBatch(Long jobId, QuestionType type, GenerationJob job, GenerationBatch batch) {
        try {
            int existing = questionMapper.countByJobAndType(jobId, type);
            int need = Math.max(0, batch.getRequestedCount() - existing);
            if (need == 0) {
                markBatch(batch, "SUCCESS", need, null, null);
                refreshJobStatus(jobId);
                hub.emit(jobId, "done", Map.of("status", jobMapper.selectById(jobId).getStatus()));
                return;
            }
            GenerateParams params = parseParams(job);
            ChatModel model = modelFactory.get(modelService.getRequired(job.getModelProfileId()));
            List<String> dedupStems = buildDedupContext(params);
            Counters counters = new Counters();

            hub.emit(jobId, "batch_started", Map.of("type", type.name(), "count", need));
            markBatch(batch, "RUNNING", need, null, null);
            String instruction = job.getOptimizedPrompt() != null && !job.getOptimizedPrompt().isBlank()
                    ? job.getOptimizedPrompt()
                    : job.getPrompt();
            runOneBatch(jobId, type, need, params, instruction, model, dedupStems, counters);

            // 累加到 job 已有总量上（retry 是增量，不能覆盖）
            jobMapper.updateProgress(jobId,
                    job.getGeneratedCount() + counters.generated.get(),
                    job.getPromptTokens() + counters.promptTokens.get(),
                    job.getCompletionTokens() + counters.completionTokens.get(),
                    job.getCostMs() + counters.costMs.get());
            refreshJobStatus(jobId);
            hub.emit(jobId, "done", Map.of("status", jobMapper.selectById(jobId).getStatus()));
        } finally {
            hub.complete(jobId);
        }
    }

    /**
     * 确认组卷：DRAFT → ACTIVE，创建 Exam 与题序。
     * <p>遇 SQLITE_BUSY 自动短重试（出题刚结束时偶发锁竞争）。
     */
    public Long confirm(Long jobId) {
        DataAccessException last = null;
        for (int attempt = 1; attempt <= 5; attempt++) {
            try {
                Long examId = transactionTemplate.execute(status -> confirmOnce(jobId));
                return examId;
            } catch (DataAccessException e) {
                if (!isSqliteBusy(e) || attempt == 5) {
                    throw e;
                }
                last = e;
                log.warn("确认组卷遇数据库忙，重试 {}/5：{}", attempt, e.getMostSpecificCause().getMessage());
                try {
                    Thread.sleep(80L * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
        throw last;
    }

    private Long confirmOnce(Long jobId) {
        GenerationJob job = getRequired(jobId);
        if (!isTerminal(job.getStatus())) {
            throw new BizException("任务还在生成中，请稍候");
        }
        List<Question> drafts = questionMapper.selectByJobId(jobId).stream()
                .filter(q -> "DRAFT".equals(q.getStatus()))
                .toList();
        if (drafts.isEmpty()) {
            // 可能上次已组卷成功但前端未收到：幂等返回已有试卷
            Exam existing = examMapper.selectOne(Wrappers.<Exam>lambdaQuery()
                    .eq(Exam::getJobId, jobId)
                    .orderByDesc(Exam::getId)
                    .last("LIMIT 1"));
            if (existing != null) {
                return existing.getId();
            }
            throw new BizException("没有可组卷的题目");
        }

        Exam exam = new Exam();
        exam.setName(deriveExamName(job.getPrompt()));
        exam.setCategory(job.getCategory());
        exam.setSource("GENERATED");
        exam.setJobId(jobId);
        exam.setArticleId(job.getArticleId());
        exam.setStatus("NOT_STARTED");
        exam.setQuestionCount(drafts.size());
        exam.setFullScore(drafts.stream().mapToInt(Question::getFullScore).sum());
        examMapper.insert(exam);

        int seq = 1;
        for (Question q : drafts) {
            ExamQuestion eq = new ExamQuestion();
            eq.setExamId(exam.getId());
            eq.setQuestionId(q.getId());
            eq.setSeq(seq++);
            examQuestionMapper.insert(eq);
        }
        questionMapper.bulkActivate(jobId);
        return exam.getId();
    }

    private static boolean isSqliteBusy(DataAccessException e) {
        Throwable c = e.getMostSpecificCause();
        String msg = c == null ? "" : String.valueOf(c.getMessage());
        return msg.contains("SQLITE_BUSY") || msg.contains("database is locked");
    }

    /* ========================================================== SSE 辅助 */

    public boolean isTerminal(String status) {
        return TERMINAL.contains(status);
    }

    /** 从 job 行构造进度快照（stream 重放用）。 */
    public Map<String, Object> progressPayload(GenerationJob job) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("generated", job.getGeneratedCount());
        m.put("requested", job.getRequestedCount());
        m.put("promptTokens", job.getPromptTokens());
        m.put("completionTokens", job.getCompletionTokens());
        m.put("costMs", job.getCostMs());
        return m;
    }

    /* ========================================================== 后台执行 */

    private void run(Long jobId) {
        GenerationJob job = jobMapper.selectById(jobId);
        if (job == null) {
            return;
        }
        // 先占坑 SSE sink，避免优化/出题事件在前端订阅前被丢弃
        hub.sink(jobId);
        try {
            GenerateParams params = parseParams(job);
            ChatModel model = modelFactory.get(modelService.getRequired(job.getModelProfileId()));
            Counters counters = new Counters();

            // 0) 未选主分类时，先让模型从已有分类中选或新建
            if (job.getCategory() == null || job.getCategory().isBlank()) {
                String inferred = classifyCategory(jobId, job, model, counters);
                if (inferred != null) {
                    job.setCategory(inferred);
                    params.setCategory(inferred);
                    GenerationJob catUpdate = new GenerationJob();
                    catUpdate.setId(jobId);
                    catUpdate.setCategory(inferred);
                    jobMapper.updateById(catUpdate);
                }
            }

            // 1) 按需优化用户提示词；关闭自动优化时直接用原文（仍注入文章摘要）
            boolean doOptimize = params.getAutoOptimize() == null || Boolean.TRUE.equals(params.getAutoOptimize());
            String instruction = doOptimize
                    ? optimizeUserPrompt(jobId, job, params, model, counters)
                    : skipOptimizeUserPrompt(jobId, job, counters);
            if (isCancelled(jobId)) {
                finishCancelled(jobId, counters);
                return;
            }

            List<String> dedupStems = buildDedupContext(params);
            List<Map.Entry<QuestionType, Integer>> batches = params.getCounts().entrySet().stream()
                    .filter(e -> e.getValue() != null && e.getValue() > 0)
                    .sorted(Comparator.comparing(e -> e.getKey().name()))
                    .toList();

            // 落库批次占位，预览页靠它展示逐批状态
            for (var b : batches) {
                GenerationBatch gb = new GenerationBatch();
                gb.setJobId(jobId);
                gb.setBatchType(b.getKey());
                gb.setStatus("PENDING");
                gb.setRequestedCount(b.getValue());
                gb.setGeneratedCount(0);
                batchMapper.insert(gb);
            }

            String finalInstruction = instruction;
            List<CompletableFuture<String>> futures = batches.stream()
                    .map(b -> CompletableFuture.supplyAsync(() ->
                            runOneBatch(jobId, b.getKey(), b.getValue(), params, finalInstruction,
                                    model, dedupStems, counters), generationExecutor))
                    .toList();
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            boolean cancelled = Boolean.TRUE.equals(cancelFlags.get(jobId));
            List<String> statuses = futures.stream().map(CompletableFuture::join).toList();
            String status;
            if (cancelled) {
                status = "CANCELLED";
            } else if (statuses.stream().allMatch("SUCCESS"::equals)) {
                status = "SUCCESS";
            } else if (statuses.stream().anyMatch("SUCCESS"::equals)) {
                status = "PARTIAL";
            } else {
                status = "FAILED";
            }

            GenerationJob update = new GenerationJob();
            update.setId(jobId);
            update.setStatus(status);
            update.setGeneratedCount(counters.generated.get());
            update.setPromptTokens(counters.promptTokens.get());
            update.setCompletionTokens(counters.completionTokens.get());
            update.setCostMs(counters.costMs.get());
            update.setErrorMsg(counters.errorMsg());
            update.setRawOutput(counters.rawOutput());
            jobMapper.updateById(update);

            hub.emit(jobId, "done", Map.of(
                    "status", status,
                    "generated", counters.generated.get(),
                    "errorMsg", Objects.toString(counters.errorMsg(), "")));
            log.info("出题任务 {} 完成：{}，生成 {} 题，{}ms", jobId, status,
                    counters.generated.get(), counters.costMs.get());
        } catch (Exception e) {
            log.error("出题任务 {} 异常", jobId, e);
            GenerationJob update = new GenerationJob();
            update.setId(jobId);
            update.setStatus("FAILED");
            update.setErrorMsg("出题流程异常：" + e.getMessage());
            jobMapper.updateById(update);
            hub.emit(jobId, "done", Map.of("status", "FAILED", "errorMsg", Objects.toString(e.getMessage(), "")));
        } finally {
            cancelFlags.remove(jobId);
            hub.complete(jobId);
        }
    }

    /**
     * 出题前优化用户提示词。失败则回退原文并继续出题（不阻断主流程）。
     * @return 实际用于出题的指令
     */
    private String optimizeUserPrompt(Long jobId, GenerationJob job, GenerateParams params,
                                      ChatModel model, Counters counters) {
        String original = job.getPrompt() == null ? "" : job.getPrompt().trim();
        String effective = withArticleSummary(original, job.getArticleId());
        hub.emit(jobId, "optimize_started", Map.of("message", "正在优化出题提示词…"));
        long start = System.nanoTime();
        try {
            if (isCancelled(jobId)) {
                return effective;
            }
            String countsBlock = buildCountsBlock(params);
            String optimizePrompt = promptBuilder.buildOptimize(effective, params, countsBlock);
            ChatResponse resp = callModel(model, optimizePrompt);
            accumulateUsage(counters, resp);
            String optimized = extractText(resp);
            if (optimized == null || optimized.isBlank()) {
                throw new IllegalStateException("模型返回空的优化结果");
            }
            // 去掉偶发围栏
            if (optimized.startsWith("```")) {
                int first = optimized.indexOf('\n');
                int last = optimized.lastIndexOf("```");
                if (first > 0 && last > first) {
                    optimized = optimized.substring(first + 1, last).trim();
                }
            }
            GenerationJob update = new GenerationJob();
            update.setId(jobId);
            update.setOptimizedPrompt(optimized);
            update.setPromptTokens(counters.promptTokens.get());
            update.setCompletionTokens(counters.completionTokens.get());
            update.setCostMs(counters.costMs.addAndGet(elapsedMs(start)));
            jobMapper.updateById(update);

            hub.emit(jobId, "optimize_done", Map.of(
                    "optimizedPrompt", optimized,
                    "promptTokens", counters.promptTokens.get(),
                    "completionTokens", counters.completionTokens.get(),
                    "costMs", counters.costMs.get()));
            log.info("出题任务 {} 提示词已优化，{} → {} 字", jobId, original.length(), optimized.length());
            return optimized;
        } catch (Exception e) {
            log.warn("出题任务 {} 提示词优化失败，回退原文：{}", jobId, e.toString());
            counters.costMs.addAndGet(elapsedMs(start));
            GenerationJob update = new GenerationJob();
            update.setId(jobId);
            update.setOptimizedPrompt(effective);
            update.setPromptTokens(counters.promptTokens.get());
            update.setCompletionTokens(counters.completionTokens.get());
            update.setCostMs(counters.costMs.get());
            jobMapper.updateById(update);
            hub.emit(jobId, "optimize_done", Map.of(
                    "optimizedPrompt", effective,
                    "fallback", true,
                    "error", Objects.toString(e.getMessage(), ""),
                    "promptTokens", counters.promptTokens.get(),
                    "completionTokens", counters.completionTokens.get(),
                    "costMs", counters.costMs.get()));
            return effective;
        }
    }

    /**
     * 用户未选手动分类时：调模型从已有列表选择或提出新建，并写入 exam_category。
     * @return 落库后的 category code；失败返回 null（出题继续，不阻断）
     */
    private String classifyCategory(Long jobId, GenerationJob job, ChatModel model, Counters counters) {
        hub.emit(jobId, "optimize_started", Map.of("message", "正在识别主分类…"));
        long start = System.nanoTime();
        try {
            String prompt = promptBuilder.buildClassifyCategory(
                    withArticleSummary(job.getPrompt() == null ? "" : job.getPrompt().trim(), job.getArticleId()));
            ChatResponse resp = callModel(model, prompt);
            accumulateUsage(counters, resp);
            counters.costMs.addAndGet(elapsedMs(start));
            String raw = extractText(resp);
            com.fasterxml.jackson.databind.JsonNode node = jsonParser.parse(raw, com.fasterxml.jackson.databind.JsonNode.class);
            String label = node.has("label") && !node.get("label").isNull() ? node.get("label").asText("").trim() : "";
            String codeHint = node.has("code") && !node.get("code").isNull() ? node.get("code").asText("").trim() : "";
            if (label.isBlank() && codeHint.isBlank()) {
                throw new IllegalStateException("分类结果为空");
            }
            String code = categoryService.ensureFromModel(codeHint, label);
            hub.emit(jobId, "progress", Map.of(
                    "generated", counters.generated.get(),
                    "requested", job.getRequestedCount() == null ? 0 : job.getRequestedCount(),
                    "promptTokens", counters.promptTokens.get(),
                    "completionTokens", counters.completionTokens.get(),
                    "costMs", counters.costMs.get(),
                    "category", code,
                    "categoryLabel", categoryService.labelOf(code)));
            log.info("出题任务 {} 推断主分类 → {} ({})", jobId, code, categoryService.labelOf(code));
            return code;
        } catch (Exception e) {
            counters.costMs.addAndGet(elapsedMs(start));
            log.warn("出题任务 {} 主分类推断失败，继续出题：{}", jobId, e.toString());
            return null;
        }
    }

    /** 跳过提示词优化：仍注入文章摘要，并写入 optimizedPrompt 供进度页展示。 */
    private String skipOptimizeUserPrompt(Long jobId, GenerationJob job, Counters counters) {
        String effective = withArticleSummary(
                job.getPrompt() == null ? "" : job.getPrompt().trim(),
                job.getArticleId());
        hub.emit(jobId, "optimize_started", Map.of("message", "已跳过提示词优化"));
        GenerationJob update = new GenerationJob();
        update.setId(jobId);
        update.setOptimizedPrompt(effective);
        update.setPromptTokens(counters.promptTokens.get());
        update.setCompletionTokens(counters.completionTokens.get());
        update.setCostMs(counters.costMs.get());
        jobMapper.updateById(update);
        hub.emit(jobId, "optimize_done", Map.of(
                "optimizedPrompt", effective,
                "skipped", true,
                "promptTokens", counters.promptTokens.get(),
                "completionTokens", counters.completionTokens.get(),
                "costMs", counters.costMs.get()));
        return effective;
    }

    /** 文章开卷：把考点摘要拼进优化前的用户意图，避免把长文塞进 prompt 列。 */
    private String withArticleSummary(String userPrompt, Long articleId) {
        if (articleId == null) {
            return userPrompt;
        }
        Article article = articleMapper.selectById(articleId);
        if (article == null || article.getSummaryMd() == null || article.getSummaryMd().isBlank()) {
            return userPrompt;
        }
        String summary = article.getSummaryMd().trim();
        if (summary.length() > 40_000) {
            summary = summary.substring(0, 40_000) + "\n\n…（摘要过长，已截断）";
        }
        return userPrompt + "\n\n===== 文章《" + article.getTitle() + "》考点摘要 =====\n" + summary;
    }

    private void finishCancelled(Long jobId, Counters counters) {
        GenerationJob update = new GenerationJob();
        update.setId(jobId);
        update.setStatus("CANCELLED");
        update.setGeneratedCount(counters.generated.get());
        update.setPromptTokens(counters.promptTokens.get());
        update.setCompletionTokens(counters.completionTokens.get());
        update.setCostMs(counters.costMs.get());
        jobMapper.updateById(update);
        hub.emit(jobId, "done", Map.of("status", "CANCELLED", "generated", counters.generated.get(), "errorMsg", ""));
    }

    private static String buildCountsBlock(GenerateParams params) {
        if (params.getCounts() == null || params.getCounts().isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("- 题型与数量：");
        boolean first = true;
        for (var e : params.getCounts().entrySet()) {
            if (e.getValue() == null || e.getValue() <= 0) {
                continue;
            }
            if (!first) {
                sb.append("、");
            }
            first = false;
            sb.append(PromptBuilder.typeLabel(e.getKey())).append(' ').append(e.getValue()).append(" 道");
        }
        return first ? "" : sb.toString();
    }

    /**
     * 跑一个题型批次：调模型 → 宽松解析 → 校验 → 失败回灌重试 → 落库。
     * 内部捕获一切异常，绝不向上抛（保证各批互不影响、任务最终有终态）。
     */
    private String runOneBatch(Long jobId, QuestionType type, int count, GenerateParams params,
                               String instruction, ChatModel model, List<String> dedupStems,
                               Counters counters) {
        long start = System.nanoTime();
        if (isCancelled(jobId)) {
            return markCancelled(jobId, type);
        }
        hub.emit(jobId, "batch_started", Map.of("type", type.name(), "count", count));
        markBatch(jobId, type, "RUNNING", count, null, null);

        String initialPrompt = promptBuilder.buildGenerate(params, instruction, type, count, dedupStems);
        String error = null;
        String rawOutput = null;

        try {
            for (int attempt = 0; attempt <= maxParseRetries; attempt++) {
                if (isCancelled(jobId)) {
                    return markCancelled(jobId, type);
                }
                String prompt = attempt == 0 ? initialPrompt
                        : promptBuilder.buildFix(type, count, error, rawOutput);
                ChatResponse resp = callModel(model, prompt);
                rawOutput = extractText(resp);
                accumulateUsage(counters, resp);

                try {
                    List<QuestionDraft> drafts = parseAndConvert(rawOutput, jobId, type, params);
                    questionSaver.saveDraft(drafts);
                    counters.generated.addAndGet(drafts.size());
                    counters.costMs.addAndGet(elapsedMs(start));
                    jobMapper.updateProgress(jobId, counters.generated.get(),
                            counters.promptTokens.get(), counters.completionTokens.get(), counters.costMs.get());
                    markBatch(jobId, type, "SUCCESS", drafts.size(), null, null);
                    hub.emit(jobId, "batch_done", Map.of(
                            "type", type.name(),
                            "generated", drafts.size(),
                            "promptTokens", counters.promptTokens.get(),
                            "completionTokens", counters.completionTokens.get()));
                    hub.emit(jobId, "progress", liveProgress(jobId, counters));
                    return "SUCCESS";
                } catch (Exception ex) {
                    // 解析或校验失败 → 回灌重试
                    error = truncate(ex.getMessage(), 800);
                }
            }

            // 重试耗尽
            counters.costMs.addAndGet(elapsedMs(start));
            jobMapper.updateProgress(jobId, counters.generated.get(),
                    counters.promptTokens.get(), counters.completionTokens.get(), counters.costMs.get());
            markBatch(jobId, type, "FAILED", 0, error, rawOutput);
            counters.failures.add(new BatchFailure(type, error, rawOutput));
            hub.emit(jobId, "batch_failed", Map.of("type", type.name(), "error", error));
            hub.emit(jobId, "progress", liveProgress(jobId, counters));
            return "FAILED";
        } catch (Exception e) {
            // model.call 抛异常（网络/超时/模型错误）
            error = truncate(e.toString(), 800);
            counters.costMs.addAndGet(elapsedMs(start));
            jobMapper.updateProgress(jobId, counters.generated.get(),
                    counters.promptTokens.get(), counters.completionTokens.get(), counters.costMs.get());
            markBatch(jobId, type, "FAILED", 0, error, rawOutput);
            counters.failures.add(new BatchFailure(type, error, rawOutput));
            hub.emit(jobId, "batch_failed", Map.of("type", type.name(), "error", error));
            hub.emit(jobId, "progress", liveProgress(jobId, counters));
            return "FAILED";
        }
    }

    private String markCancelled(Long jobId, QuestionType type) {
        GenerationBatch batch = batchMapper.selectByJobAndType(jobId, type);
        if (batch != null) {
            markBatch(batch, "CANCELLED", 0, null, null);
        }
        hub.emit(jobId, "batch_failed", Map.of("type", type.name(), "error", "已取消"));
        return "CANCELLED";
    }

    private boolean isCancelled(Long jobId) {
        return Boolean.TRUE.equals(cancelFlags.get(jobId));
    }

    /** 解析 + 校验 + 转实体（含合并用户标签）。任一道不合格即抛，整批重试。 */
    private List<QuestionDraft> parseAndConvert(String raw, Long jobId, QuestionType expectedType,
                                                GenerateParams params) {
        QuestionBatchDTO.Batch batch = jsonParser.parse(raw, QuestionBatchDTO.Batch.class);
        if (batch.getQuestions() == null || batch.getQuestions().isEmpty()) {
            throw new IllegalStateException("模型没有返回任何题目");
        }
        List<QuestionDraft> drafts = new ArrayList<>();
        for (QuestionBatchDTO.QuestionDTO dto : batch.getQuestions()) {
            Question q = converter.toEntity(expectedType, dto);
            q.setJobId(jobId);
            String fallbackLabel = params.getCategory() == null || params.getCategory().isBlank()
                    ? null : categoryService.labelOf(params.getCategory());
            List<String> tags = converter.mergeTags(dto.getTags(), params.getTags(), fallbackLabel);
            drafts.add(new QuestionDraft(q, tags));
        }
        return drafts;
    }

    /** 调模型（Semaphore 限并发）。 */
    private ChatResponse callModel(ChatModel model, String prompt) {
        try {
            concurrencyGate.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("出题线程被中断", e);
        }
        try {
            return model.call(new Prompt(prompt));
        } finally {
            concurrencyGate.release();
        }
    }

    /* ========================================================== 内部工具 */

    private void markBatch(Long jobId, QuestionType type, String status, int generated, String error, String raw) {
        GenerationBatch batch = batchMapper.selectByJobAndType(jobId, type);
        if (batch != null) {
            markBatch(batch, status, generated, error, raw);
        }
    }

    private void markBatch(GenerationBatch batch, String status, int generated, String error, String raw) {
        batchMapper.updateResult(batch.getId(), status,
                batch.getRequestedCount(), generated, error, raw);
    }

    private void refreshJobStatus(Long jobId) {
        GenerationBatch b = batchMapper.selectByJobId(jobId).stream()
                .filter(x -> "FAILED".equals(x.getStatus()))
                .findFirst().orElse(null);
        GenerationJob job = jobMapper.selectById(jobId);
        GenerationJob update = new GenerationJob();
        update.setId(jobId);
        if (job.getGeneratedCount() > 0 && b == null) {
            update.setStatus("SUCCESS");
        } else if (job.getGeneratedCount() > 0) {
            update.setStatus("PARTIAL");
        } else {
            update.setStatus("FAILED");
        }
        jobMapper.updateById(update);
    }

    /** 去重上下文（PRD F3.2 事前防线）：相关历史题干摘要，注入各批 prompt。 */
    private List<String> buildDedupContext(GenerateParams params) {
        DedupStrength strength = params.getDedupStrength();
        if (strength == null || strength == DedupStrength.OFF) {
            return List.of();
        }
        int limit = strength == DedupStrength.STRICT ? 15 : 8;
        List<String> tags = cleanTags(params.getTags());
        if (tags.isEmpty()) {
            return questionMapper.selectRecentActive(limit).stream().map(Question::getStem).toList();
        }
        List<Long> tagIds = tagMapper.selectList(Wrappers.<Tag>lambdaQuery().in(Tag::getName, tags))
                .stream().map(Tag::getId).toList();
        if (tagIds.isEmpty()) {
            return questionMapper.selectRecentActive(limit).stream().map(Question::getStem).toList();
        }
        List<Long> qids = questionTagMapper.selectQuestionIdsByTagIds(tagIds, limit);
        if (qids.isEmpty()) {
            return List.of();
        }
        return questionMapper.selectBatchIds(qids).stream().map(Question::getStem).toList();
    }

    private static List<String> cleanTags(List<String> tags) {
        if (tags == null) {
            return List.of();
        }
        return tags.stream().filter(t -> t != null && !t.isBlank()).map(String::trim).distinct().toList();
    }

    private GenerateParams parseParams(GenerationJob job) {
        try {
            return objectMapper.readValue(job.getParamsJson(), GenerateParams.class);
        } catch (Exception e) {
            throw new IllegalStateException("任务参数损坏", e);
        }
    }

    private String deriveExamName(String prompt) {
        String firstLine = prompt == null ? "" : prompt.lines().findFirst().orElse("").trim();
        if (firstLine.length() > 30) {
            firstLine = firstLine.substring(0, 30) + "…";
        }
        return firstLine.isBlank() ? "模考" : firstLine;
    }

    private GenerationView toView(GenerationJob j, boolean withRaw) {
        GenerationView v = new GenerationView();
        v.setId(j.getId());
        v.setPrompt(j.getPrompt());
        v.setOptimizedPrompt(j.getOptimizedPrompt());
        v.setCategory(j.getCategory());
        if (j.getCategory() != null && !j.getCategory().isBlank()) {
            v.setCategoryLabel(categoryService.labelOf(j.getCategory()));
        }
        v.setArticleId(j.getArticleId());
        v.setModelProfileId(j.getModelProfileId());
        v.setModelSnapshot(j.getModelSnapshot());
        v.setStatus(j.getStatus());
        v.setRequestedCount(j.getRequestedCount());
        v.setGeneratedCount(j.getGeneratedCount());
        v.setPromptTokens(j.getPromptTokens());
        v.setCompletionTokens(j.getCompletionTokens());
        v.setCostMs(j.getCostMs());
        v.setErrorMsg(j.getErrorMsg());
        if (withRaw) {
            v.setRawOutput(j.getRawOutput());
        }
        try {
            v.setParams(parseParams(j));
        } catch (Exception ignored) {
            v.setParams(null);
        }
        v.setCreatedAt(j.getCreatedAt());
        return v;
    }

    private Map<String, Object> liveProgress(Long jobId, Counters counters) {
        GenerationJob job = jobMapper.selectById(jobId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("generated", counters.generated.get());
        m.put("requested", job.getRequestedCount());
        m.put("promptTokens", counters.promptTokens.get());
        m.put("completionTokens", counters.completionTokens.get());
        m.put("costMs", counters.costMs.get());
        return m;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 序列化失败", e);
        }
    }

    private void accumulateUsage(Counters c, ChatResponse resp) {
        if (resp != null && resp.getMetadata() != null && resp.getMetadata().getUsage() != null) {
            Usage usage = resp.getMetadata().getUsage();
            c.promptTokens.addAndGet(usage.getPromptTokens() == null ? 0 : usage.getPromptTokens());
            c.completionTokens.addAndGet(usage.getCompletionTokens() == null ? 0 : usage.getCompletionTokens());
        }
    }

    private static String extractText(ChatResponse response) {
        if (response == null || response.getResult() == null || response.getResult().getOutput() == null) {
            return "";
        }
        String text = response.getResult().getOutput().getText();
        return text == null ? "" : text.trim();
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }

    private static long elapsedMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }

    /* ========================================================== 内部状态 */

    private static class Counters {
        final AtomicInteger generated = new AtomicInteger();
        final AtomicInteger promptTokens = new AtomicInteger();
        final AtomicInteger completionTokens = new AtomicInteger();
        final AtomicLong costMs = new AtomicLong();
        final List<BatchFailure> failures = new java.util.concurrent.CopyOnWriteArrayList<>();

        String errorMsg() {
            if (failures.isEmpty()) {
                return null;
            }
            return failures.stream()
                    .map(f -> f.type().name() + "：" + f.error())
                    .collect(Collectors.joining(" | "));
        }

        String rawOutput() {
            if (failures.isEmpty()) {
                return null;
            }
            return failures.stream()
                    .map(f -> "===== " + f.type().name() + " =====\n" + f.raw())
                    .collect(Collectors.joining("\n\n"));
        }
    }

    private record BatchFailure(QuestionType type, String error, String raw) {}
}
