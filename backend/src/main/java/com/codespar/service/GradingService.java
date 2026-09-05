package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.ai.ChatModelFactory;
import com.codespar.ai.GradingEventHub;
import com.codespar.ai.LenientJsonParser;
import com.codespar.ai.PromptBuilder;
import com.codespar.ai.QuestionBatchDTO;
import com.codespar.mapper.AnswerMapper;
import com.codespar.mapper.ExamMapper;
import com.codespar.mapper.ExamQuestionMapper;
import com.codespar.mapper.GradingMapper;
import com.codespar.mapper.QuestionGradingMapper;
import com.codespar.mapper.QuestionMapper;
import com.codespar.mapper.WrongQuestionMapper;
import com.codespar.model.dto.GradingDTO;
import com.codespar.model.dto.GradingDTO.FillEquivResult;
import com.codespar.model.dto.GradingDTO.OverrideRequest;
import com.codespar.model.dto.GradingDTO.PointResult;
import com.codespar.model.dto.GradingDTO.QuestionReport;
import com.codespar.model.dto.GradingDTO.ReportView;
import com.codespar.model.dto.GradingDTO.RubricHit;
import com.codespar.model.dto.GradingDTO.SubjectiveGradeResult;
import com.codespar.model.dto.GradingDTO.TagScore;
import com.codespar.model.dto.GradingDTO.TypeScore;
import com.codespar.model.entity.Answer;
import com.codespar.model.entity.Exam;
import com.codespar.model.entity.ExamQuestion;
import com.codespar.model.entity.Grading;
import com.codespar.model.entity.ModelProfile;
import com.codespar.model.entity.Question;
import com.codespar.model.entity.QuestionGrading;
import com.codespar.model.entity.WrongQuestion;
import com.codespar.model.enums.QuestionType;
import com.codespar.service.LocalScorer.ObjectiveResult;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.core.type.TypeReference;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
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

/**
 * 阅卷编排（P5）：
 * 客观题本地判分 → 填空未命中再语义判定 → 主观题按 rubric 并发调模型 →
 * 后端汇总得分 → SSE 进度 → 写回 exam → 低分题进错题本。
 */
@Slf4j
@Service
public class GradingService {

    private static final Set<String> TERMINAL = Set.of("SUCCESS", "PARTIAL", "FAILED");

    private final GradingMapper gradingMapper;
    private final QuestionGradingMapper questionGradingMapper;
    private final ExamMapper examMapper;
    private final ExamQuestionMapper examQuestionMapper;
    private final QuestionMapper questionMapper;
    private final AnswerMapper answerMapper;
    private final WrongQuestionMapper wrongQuestionMapper;
    private final QuestionConverter converter;
    private final QuestionTaggingService tagging;
    private final LocalScorer localScorer;
    private final ChatModelFactory modelFactory;
    private final ModelProfileService modelService;
    private final PromptBuilder promptBuilder;
    private final LenientJsonParser jsonParser;
    private final GradingEventHub hub;
    private final ExecutorService generationExecutor;
    private final Semaphore concurrencyGate;
    private final double wrongBookThreshold;
    private final int maxParseRetries;

    /** 正在跑的阅卷，避免同一卷重复启动。 */
    private final ConcurrentHashMap<Long, Boolean> runningExams = new ConcurrentHashMap<>();

    public GradingService(GradingMapper gradingMapper,
                          QuestionGradingMapper questionGradingMapper,
                          ExamMapper examMapper,
                          ExamQuestionMapper examQuestionMapper,
                          QuestionMapper questionMapper,
                          AnswerMapper answerMapper,
                          WrongQuestionMapper wrongQuestionMapper,
                          QuestionConverter converter,
                          QuestionTaggingService tagging,
                          LocalScorer localScorer,
                          ChatModelFactory modelFactory,
                          ModelProfileService modelService,
                          PromptBuilder promptBuilder,
                          LenientJsonParser jsonParser,
                          GradingEventHub hub,
                          ExecutorService generationExecutor,
                          @Value("${codespar.grading.concurrency:3}") int concurrency,
                          @Value("${codespar.grading.wrong-book-threshold:0.6}") double wrongBookThreshold,
                          @Value("${codespar.generation.max-parse-retries:2}") int maxParseRetries) {
        this.gradingMapper = gradingMapper;
        this.questionGradingMapper = questionGradingMapper;
        this.examMapper = examMapper;
        this.examQuestionMapper = examQuestionMapper;
        this.questionMapper = questionMapper;
        this.answerMapper = answerMapper;
        this.wrongQuestionMapper = wrongQuestionMapper;
        this.converter = converter;
        this.tagging = tagging;
        this.localScorer = localScorer;
        this.modelFactory = modelFactory;
        this.modelService = modelService;
        this.promptBuilder = promptBuilder;
        this.jsonParser = jsonParser;
        this.hub = hub;
        this.generationExecutor = generationExecutor;
        this.concurrencyGate = new Semaphore(concurrency);
        this.wrongBookThreshold = wrongBookThreshold;
        this.maxParseRetries = maxParseRetries;
    }

    /* ========================================================== 对外入口 */

    /**
     * 对已交卷试卷启动阅卷。幂等：已有 RUNNING 返回现有 id；已 GRADED 且 SUCCESS 可强制重跑需另开接口。
     */
    public Long startGrading(Long examId, Long gradingModelId) {
        Exam exam = examMapper.selectById(examId);
        if (exam == null) {
            throw new BizException("试卷不存在：" + examId);
        }
        if (!"SUBMITTED".equals(exam.getStatus()) && !"GRADED".equals(exam.getStatus())) {
            throw new BizException("只有已交卷的试卷可以阅卷，当前状态：" + exam.getStatus());
        }

        Grading existing = gradingMapper.selectLatestByExamId(examId);
        if (existing != null && "RUNNING".equals(existing.getStatus())) {
            return existing.getId();
        }

        boolean needsModel = examNeedsModel(examId);
        ModelProfile model = null;
        if (needsModel) {
            model = resolveGradeModel(gradingModelId);
        } else if (gradingModelId != null) {
            model = modelService.getRequired(gradingModelId);
        } else {
            try {
                model = modelService.getDefaultFor(false);
            } catch (BizException ignored) {
                // 纯客观卷允许没有阅卷模型
            }
        }

        if (runningExams.putIfAbsent(examId, true) != null) {
            Grading again = gradingMapper.selectLatestByExamId(examId);
            if (again != null && "RUNNING".equals(again.getStatus())) {
                return again.getId();
            }
            // 上一次刚结束但标志未清：继续往下开新一轮
            runningExams.put(examId, true);
        }

        try {
            Grading grading = new Grading();
            grading.setExamId(examId);
            if (model != null) {
                grading.setModelProfileId(model.getId());
                grading.setModelSnapshot(model.getName());
                exam.setGradingModelProfileId(model.getId());
                examMapper.updateById(exam);
            }
            grading.setStatus("RUNNING");
            grading.setTotalScore(BigDecimal.ZERO);
            grading.setFullScore(exam.getFullScore() == null ? 0 : exam.getFullScore());
            grading.setPromptTokens(0);
            grading.setCompletionTokens(0);
            grading.setCostMs(0L);
            gradingMapper.insert(grading);

            Long gradingId = grading.getId();
            Long modelId = model == null ? null : model.getId();
            generationExecutor.execute(() -> run(gradingId, modelId));
            return gradingId;
        } catch (RuntimeException e) {
            runningExams.remove(examId);
            throw e;
        }
    }

    public Grading getRequired(Long id) {
        Grading g = gradingMapper.selectById(id);
        if (g == null) {
            throw new BizException("阅卷任务不存在：" + id);
        }
        return g;
    }

    public GradingDTO.GradingView detail(Long id) {
        return toView(getRequired(id));
    }

    public GradingDTO.GradingView latestByExam(Long examId) {
        Grading g = gradingMapper.selectLatestByExamId(examId);
        return g == null ? null : toView(g);
    }

    public boolean isTerminal(String status) {
        return TERMINAL.contains(status);
    }

    public Map<String, Object> progressPayload(Grading g) {
        List<QuestionGrading> qgs = questionGradingMapper.selectByGradingId(g.getId());
        int graded = qgs.size();
        Exam exam = examMapper.selectById(g.getExamId());
        int total = exam == null || exam.getQuestionCount() == null ? graded : exam.getQuestionCount();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("graded", graded);
        m.put("total", total);
        m.put("totalScore", g.getTotalScore());
        m.put("fullScore", g.getFullScore());
        m.put("promptTokens", g.getPromptTokens());
        m.put("completionTokens", g.getCompletionTokens());
        m.put("costMs", g.getCostMs());
        m.put("status", g.getStatus());
        return m;
    }

    /** 单题失败重试（不影响整卷其他题）。 */
    public void retryQuestion(Long gradingId, Long questionId) {
        Grading grading = getRequired(gradingId);
        if ("RUNNING".equals(grading.getStatus())) {
            throw new BizException("阅卷仍在进行中，请稍候");
        }
        QuestionGrading qg = questionGradingMapper.selectByGradingAndQuestion(gradingId, questionId);
        if (qg == null) {
            throw new BizException("该题尚未有阅卷记录");
        }
        if (qg.getErrorMsg() == null || qg.getErrorMsg().isBlank()) {
            throw new BizException("该题阅卷成功，无需重试");
        }
        Exam exam = examMapper.selectById(grading.getExamId());
        if (exam == null) {
            throw new BizException("试卷不存在");
        }
        grading.setStatus("RUNNING");
        gradingMapper.updateById(grading);
        exam.setStatus("SUBMITTED"); // 重试期间先不当 GRADED
        examMapper.updateById(exam);

        Long modelId = grading.getModelProfileId();
        runningExams.put(exam.getId(), true);
        generationExecutor.execute(() -> retryOne(gradingId, questionId, modelId));
    }

    /** 人工覆盖分数。 */
    @Transactional
    public QuestionReport overrideScore(Long gradingId, Long questionId, OverrideRequest req) {
        Grading grading = getRequired(gradingId);
        if ("RUNNING".equals(grading.getStatus())) {
            throw new BizException("阅卷仍在进行中");
        }
        QuestionGrading qg = questionGradingMapper.selectByGradingAndQuestion(gradingId, questionId);
        if (qg == null) {
            throw new BizException("该题尚未有阅卷记录");
        }
        BigDecimal score = req.getScore();
        if (score.compareTo(BigDecimal.valueOf(qg.getFullScore())) > 0) {
            throw new BizException("分数不能超过满分 " + qg.getFullScore());
        }
        // MyBatis-Plus 默认跳过 null 字段，errorMsg 必须用 UpdateWrapper 才能清空
        questionGradingMapper.update(null, Wrappers.<QuestionGrading>lambdaUpdate()
                .eq(QuestionGrading::getId, qg.getId())
                .set(QuestionGrading::getScore, score)
                .set(QuestionGrading::getManualOverride, true)
                .set(QuestionGrading::getOverrideReason, req.getReason())
                .set(QuestionGrading::getErrorMsg, null)
                .set(QuestionGrading::getComment,
                        req.getReason() == null || req.getReason().isBlank()
                                ? "人工覆盖分数"
                                : "人工覆盖：" + req.getReason()));
        grading = getRequired(gradingId);

        recalculateTotals(grading);
        syncExamScores(grading);

        ReportView report = buildReport(grading.getExamId());
        return report.getQuestions().stream()
                .filter(q -> questionId.equals(q.getQuestionId()))
                .findFirst()
                .orElseThrow();
    }

    public ReportView buildReport(Long examId) {
        Exam exam = examMapper.selectById(examId);
        if (exam == null) {
            throw new BizException("试卷不存在：" + examId);
        }
        if (!"SUBMITTED".equals(exam.getStatus()) && !"GRADED".equals(exam.getStatus())) {
            throw new BizException("试卷尚未交卷");
        }

        ReportView report = new ReportView();
        report.setExamId(exam.getId());
        report.setExamName(exam.getName());
        report.setExamStatus(exam.getStatus());
        report.setQuestionCount(exam.getQuestionCount());
        report.setFullScore(exam.getFullScore());
        report.setDurationSec(exam.getDurationSec());
        report.setStartedAt(exam.getStartedAt());
        report.setSubmittedAt(exam.getSubmittedAt());
        if (exam.getOriginExamId() != null) {
            report.setOriginExamId(exam.getOriginExamId());
            Exam origin = examMapper.selectById(exam.getOriginExamId());
            if (origin != null) {
                report.setOriginTotalScore(origin.getTotalScore());
                report.setOriginScoreRate(origin.getScoreRate());
            }
        }

        Grading grading = gradingMapper.selectLatestByExamId(examId);
        if (grading == null) {
            report.setQuestions(List.of());
            report.setTagScores(List.of());
            report.setTypeScores(List.of());
            return report;
        }
        report.setGrading(toView(grading));

        List<ExamQuestion> links = examQuestionMapper.selectByExamId(examId);
        Map<Long, Answer> answers = new HashMap<>();
        for (Answer a : answerMapper.selectByExamId(examId)) {
            answers.put(a.getQuestionId(), a);
        }
        Map<Long, QuestionGrading> qgByQ = new HashMap<>();
        for (QuestionGrading qg : questionGradingMapper.selectByGradingId(grading.getId())) {
            qgByQ.put(qg.getQuestionId(), qg);
        }

        List<Long> qids = links.stream().map(ExamQuestion::getQuestionId).toList();
        Map<Long, Question> questions = new HashMap<>();
        if (!qids.isEmpty()) {
            for (Question q : questionMapper.selectBatchIds(qids)) {
                questions.put(q.getId(), q);
            }
        }

        Map<String, Agg> tagAgg = new LinkedHashMap<>();
        Map<QuestionType, Agg> typeAgg = new LinkedHashMap<>();
        List<QuestionReport> items = new ArrayList<>();

        for (ExamQuestion link : links) {
            Question q = questions.get(link.getQuestionId());
            if (q == null) {
                continue;
            }
            QuestionGrading qg = qgByQ.get(q.getId());
            Answer ans = answers.get(q.getId());
            List<String> tags = tagging.namesOf(q.getId());

            QuestionReport item = new QuestionReport();
            item.setQuestionId(q.getId());
            item.setSeq(link.getSeq());
            item.setType(q.getType());
            item.setDifficulty(q.getDifficulty());
            item.setStem(q.getStem());
            item.setOptions(converter.parseList(q.getOptionsJson(), new TypeReference<>() {}));
            item.setCorrectAnswer(q.getCorrectAnswer());
            item.setAcceptedAnswers(converter.parseList(q.getAcceptedAnswers(), new TypeReference<>() {}));
            item.setReferenceAnswer(q.getReferenceAnswer());
            item.setExplanation(q.getExplanation());
            item.setRubric(converter.parseList(q.getRubricJson(), new TypeReference<>() {}));
            item.setTags(tags);
            item.setFullScore(q.getFullScore());
            item.setUserAnswer(ans == null ? null : displayAnswer(q.getType(), ans.getContent()));
            item.setFlagged(ans != null && Boolean.TRUE.equals(ans.getFlagged()));
            if (qg != null) {
                item.setScore(qg.getScore());
                item.setComment(qg.getComment());
                item.setGradedBy(qg.getGradedBy());
                item.setManualOverride(Boolean.TRUE.equals(qg.getManualOverride()));
                item.setOverrideReason(qg.getOverrideReason());
                item.setErrorMsg(qg.getErrorMsg());
                item.setRubricResult(parseRubricResult(qg.getRubricResultJson()));
            }
            WrongQuestion wq = wrongQuestionMapper.selectByQuestionId(q.getId());
            item.setInWrongBook(wq != null && "ACTIVE".equals(wq.getStatus()));
            items.add(item);

            BigDecimal earned = qg == null || qg.getScore() == null ? BigDecimal.ZERO : qg.getScore();
            int full = q.getFullScore() == null ? 0 : q.getFullScore();
            typeAgg.computeIfAbsent(q.getType(), k -> new Agg()).add(earned, full);
            for (String tag : tags) {
                tagAgg.computeIfAbsent(tag, k -> new Agg()).add(earned, full);
            }
        }

        report.setQuestions(items);
        report.setTypeScores(typeAgg.entrySet().stream().map(e -> {
            TypeScore ts = new TypeScore();
            ts.setType(e.getKey());
            ts.setEarned(e.getValue().earned);
            ts.setFull(e.getValue().full);
            ts.setRate(LocalScorer.rate(e.getValue().earned, e.getValue().full));
            ts.setQuestionCount(e.getValue().count);
            return ts;
        }).toList());
        report.setTagScores(tagAgg.entrySet().stream().map(e -> {
            TagScore ts = new TagScore();
            ts.setTag(e.getKey());
            ts.setEarned(e.getValue().earned);
            ts.setFull(e.getValue().full);
            ts.setRate(LocalScorer.rate(e.getValue().earned, e.getValue().full));
            ts.setQuestionCount(e.getValue().count);
            return ts;
        }).sorted((a, b) -> a.getRate().compareTo(b.getRate())).toList());
        return report;
    }

    /* ========================================================== 后台执行 */

    private void run(Long gradingId, Long modelProfileId) {
        Grading grading = gradingMapper.selectById(gradingId);
        if (grading == null) {
            return;
        }
        Long examId = grading.getExamId();
        try {
            List<ExamQuestion> links = examQuestionMapper.selectByExamId(examId);
            Map<Long, Answer> answers = new HashMap<>();
            for (Answer a : answerMapper.selectByExamId(examId)) {
                answers.put(a.getQuestionId(), a);
            }
            List<Long> qids = links.stream().map(ExamQuestion::getQuestionId).toList();
            Map<Long, Question> questions = new HashMap<>();
            if (!qids.isEmpty()) {
                for (Question q : questionMapper.selectBatchIds(qids)) {
                    questions.put(q.getId(), q);
                }
            }

            ChatModel chatModel = null;
            if (modelProfileId != null) {
                chatModel = modelFactory.get(modelService.getRequired(modelProfileId));
            }

            Counters counters = new Counters();
            AtomicInteger gradedCount = new AtomicInteger();
            int total = links.size();
            hub.emit(gradingId, "progress", liveProgress(gradingId, gradedCount.get(), total, counters));

            List<CompletableFuture<Void>> futures = new ArrayList<>();
            for (ExamQuestion link : links) {
                Question q = questions.get(link.getQuestionId());
                if (q == null) {
                    continue;
                }
                Answer ans = answers.get(q.getId());
                String content = ans == null ? null : ans.getContent();
                ChatModel modelRef = chatModel;
                futures.add(CompletableFuture.runAsync(() -> {
                    gradeOne(gradingId, q, content, modelRef, counters);
                    int done = gradedCount.incrementAndGet();
                    hub.emit(gradingId, "question_done", Map.of(
                            "questionId", q.getId(),
                            "seq", link.getSeq(),
                            "graded", done,
                            "total", total));
                    hub.emit(gradingId, "progress", liveProgress(gradingId, done, total, counters));
                }, generationExecutor));
            }
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            finalizeGrading(gradingId, counters);
        } catch (Exception e) {
            log.error("阅卷 {} 异常", gradingId, e);
            Grading g = gradingMapper.selectById(gradingId);
            if (g != null) {
                g.setStatus("FAILED");
                g.setErrorMsg("阅卷流程异常：" + e.getMessage());
                gradingMapper.updateById(g);
                hub.emit(gradingId, "done", Map.of("status", "FAILED", "errorMsg", Objects.toString(e.getMessage(), "")));
            }
        } finally {
            runningExams.remove(examId);
            hub.complete(gradingId);
        }
    }

    private void retryOne(Long gradingId, Long questionId, Long modelProfileId) {
        Grading grading = gradingMapper.selectById(gradingId);
        if (grading == null) {
            return;
        }
        Long examId = grading.getExamId();
        try {
            Question q = questionMapper.selectById(questionId);
            if (q == null) {
                throw new BizException("题目不存在");
            }
            Answer ans = answerMapper.selectByExamAndQuestion(examId, questionId);
            String content = ans == null ? null : ans.getContent();
            ChatModel chatModel = modelProfileId == null
                    ? null : modelFactory.get(modelService.getRequired(modelProfileId));

            // 删旧记录再写
            QuestionGrading old = questionGradingMapper.selectByGradingAndQuestion(gradingId, questionId);
            if (old != null) {
                questionGradingMapper.deleteById(old.getId());
            }

            Counters counters = new Counters();
            // 继承已有 token
            counters.promptTokens.addAndGet(nvl(grading.getPromptTokens()));
            counters.completionTokens.addAndGet(nvl(grading.getCompletionTokens()));
            counters.costMs.addAndGet(grading.getCostMs() == null ? 0 : grading.getCostMs());

            gradeOne(gradingId, q, content, chatModel, counters);
            finalizeGrading(gradingId, counters);
            hub.emit(gradingId, "done", Map.of("status", gradingMapper.selectById(gradingId).getStatus()));
        } catch (Exception e) {
            log.error("单题重试失败 grading={} q={}", gradingId, questionId, e);
            Grading g = gradingMapper.selectById(gradingId);
            if (g != null) {
                g.setStatus("PARTIAL");
                g.setErrorMsg("单题重试失败：" + e.getMessage());
                gradingMapper.updateById(g);
            }
            hub.emit(gradingId, "done", Map.of("status", "PARTIAL", "errorMsg", Objects.toString(e.getMessage(), "")));
        } finally {
            runningExams.remove(examId);
            hub.complete(gradingId);
        }
    }

    private void gradeOne(Long gradingId, Question q, String userAnswer, ChatModel model, Counters counters) {
        long start = System.nanoTime();
        QuestionGrading qg = new QuestionGrading();
        qg.setGradingId(gradingId);
        qg.setQuestionId(q.getId());
        qg.setFullScore(q.getFullScore() == null ? 0 : q.getFullScore());
        qg.setManualOverride(false);

        try {
            QuestionType type = q.getType();
            if (type == QuestionType.SINGLE_CHOICE || type == QuestionType.MULTI_CHOICE
                    || type == QuestionType.TRUE_FALSE) {
                ObjectiveResult r = localScorer.scoreChoice(type, q.getCorrectAnswer(), userAnswer, qg.getFullScore());
                qg.setScore(r.score());
                qg.setComment(r.comment());
                qg.setGradedBy("LOCAL");
            } else if (type == QuestionType.FILL_BLANK) {
                List<String> accepted = converter.parseList(q.getAcceptedAnswers(), new TypeReference<>() {});
                if (accepted.isEmpty() && q.getCorrectAnswer() != null && !q.getCorrectAnswer().isBlank()) {
                    accepted = List.of(q.getCorrectAnswer().trim());
                }
                ObjectiveResult r = localScorer.scoreFillBlank(accepted, userAnswer, qg.getFullScore());
                if (r.matched()) {
                    qg.setScore(r.score());
                    qg.setComment(r.comment());
                    qg.setGradedBy("LOCAL");
                } else if (userAnswer == null || userAnswer.isBlank()) {
                    qg.setScore(BigDecimal.ZERO);
                    qg.setComment("未作答");
                    qg.setGradedBy("LOCAL");
                } else {
                    // 语义等价
                    if (model == null) {
                        qg.setScore(BigDecimal.ZERO);
                        qg.setComment("本地未匹配，且未配置阅卷模型，记 0 分");
                        qg.setGradedBy("LOCAL");
                    } else {
                        gradeFillWithModel(qg, q, accepted, userAnswer, model, counters);
                    }
                }
            } else if (QuestionConverter.isSubjective(type)) {
                if (userAnswer == null || userAnswer.isBlank()) {
                    qg.setScore(BigDecimal.ZERO);
                    qg.setComment("未作答");
                    qg.setGradedBy("LOCAL");
                    qg.setRubricResultJson(zeroRubricJson(q));
                } else if (model == null) {
                    qg.setScore(BigDecimal.ZERO);
                    qg.setComment("主观题需要阅卷模型，当前未配置");
                    qg.setGradedBy("LOCAL");
                    qg.setErrorMsg("缺少阅卷模型");
                } else {
                    gradeSubjective(qg, q, userAnswer, model, counters);
                }
            } else {
                qg.setScore(BigDecimal.ZERO);
                qg.setComment("未知题型，无法判分");
                qg.setGradedBy("LOCAL");
                qg.setErrorMsg("未知题型：" + type);
            }
            counters.costMs.addAndGet(elapsedMs(start));
        } catch (Exception e) {
            log.warn("判分失败 grading={} q={}: {}", gradingId, q.getId(), e.toString());
            qg.setScore(BigDecimal.ZERO);
            qg.setGradedBy(QuestionConverter.isSubjective(q.getType()) ? "MODEL" : "LOCAL");
            qg.setErrorMsg(truncate(e.getMessage(), 800));
            qg.setComment("判分失败：" + truncate(e.getMessage(), 200));
            counters.costMs.addAndGet(elapsedMs(start));
            counters.failures.incrementAndGet();
        }

        // upsert：可能已有（重试场景已删）；正常 insert
        QuestionGrading existing = questionGradingMapper.selectByGradingAndQuestion(gradingId, q.getId());
        if (existing != null) {
            qg.setId(existing.getId());
            questionGradingMapper.updateById(qg);
        } else {
            questionGradingMapper.insert(qg);
        }
    }

    private void gradeFillWithModel(QuestionGrading qg, Question q, List<String> accepted,
                                    String userAnswer, ChatModel model, Counters counters) {
        String prompt = promptBuilder.buildGradeFill(q, accepted, userAnswer);
        String error = null;
        String raw = null;
        for (int attempt = 0; attempt <= maxParseRetries; attempt++) {
            String p = attempt == 0 ? prompt
                    : "上次输出无法解析：" + error + "\n请重新只输出 JSON：{\"equivalent\":true或false,\"reason\":\"…\"}\n原文：\n" + raw;
            ChatResponse resp = callModel(model, p);
            raw = extractText(resp);
            accumulateUsage(counters, resp);
            try {
                FillEquivResult result = jsonParser.parse(raw, FillEquivResult.class);
                boolean ok = Boolean.TRUE.equals(result.getEquivalent());
                qg.setScore(ok ? BigDecimal.valueOf(qg.getFullScore()) : BigDecimal.ZERO);
                qg.setComment(result.getReason() == null
                        ? (ok ? "语义等价，判正确" : "语义不等价")
                        : result.getReason());
                qg.setGradedBy("MODEL");
                return;
            } catch (Exception ex) {
                error = truncate(ex.getMessage(), 400);
            }
        }
        throw new IllegalStateException("填空语义判定解析失败：" + error);
    }

    private void gradeSubjective(QuestionGrading qg, Question q, String userAnswer,
                                 ChatModel model, Counters counters) {
        List<QuestionBatchDTO.RubricPoint> rubric =
                converter.parseList(q.getRubricJson(), new TypeReference<>() {});
        if (rubric.isEmpty()) {
            // 无 rubric：整题交给模型给一个总分不合适，直接 0 并报错
            qg.setScore(BigDecimal.ZERO);
            qg.setComment("题目缺少评分要点，无法按 rubric 阅卷");
            qg.setGradedBy("MODEL");
            qg.setErrorMsg("缺少 rubric");
            return;
        }

        String rubricBlock = buildRubricBlock(rubric);
        String prompt = promptBuilder.buildGrade(q, rubricBlock, userAnswer);
        String error = null;
        String raw = null;
        for (int attempt = 0; attempt <= maxParseRetries; attempt++) {
            String p = attempt == 0 ? prompt
                    : "上次输出无法解析：" + error
                    + "\n请严格按原格式重新输出 JSON（含 points 与 comment）。\n原文：\n" + raw;
            ChatResponse resp = callModel(model, p);
            raw = extractText(resp);
            accumulateUsage(counters, resp);
            try {
                SubjectiveGradeResult result = jsonParser.parse(raw, SubjectiveGradeResult.class);
                List<RubricHit> hits = alignRubric(rubric, result.getPoints());
                BigDecimal sum = hits.stream()
                        .map(h -> h.getScore() == null ? BigDecimal.ZERO : h.getScore())
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                // 封顶满分
                if (sum.compareTo(BigDecimal.valueOf(qg.getFullScore())) > 0) {
                    sum = BigDecimal.valueOf(qg.getFullScore());
                }
                qg.setScore(sum);
                qg.setComment(result.getComment());
                qg.setRubricResultJson(converter.toJson(hits));
                qg.setGradedBy("MODEL");
                return;
            } catch (Exception ex) {
                error = truncate(ex.getMessage(), 400);
            }
        }
        throw new IllegalStateException("主观题阅卷解析失败：" + error);
    }

    /** 按输入 rubric 对齐模型输出；缺失的点记 MISS；得分钳制在 [0, max]。 */
    private List<RubricHit> alignRubric(List<QuestionBatchDTO.RubricPoint> rubric, List<PointResult> points) {
        Map<String, PointResult> byPoint = new HashMap<>();
        if (points != null) {
            for (PointResult p : points) {
                if (p.getPoint() != null) {
                    byPoint.put(normalizePointKey(p.getPoint()), p);
                }
            }
        }
        // 也按顺序兜底
        List<RubricHit> hits = new ArrayList<>();
        for (int i = 0; i < rubric.size(); i++) {
            QuestionBatchDTO.RubricPoint rp = rubric.get(i);
            int max = rp.getScore() == null ? 0 : rp.getScore();
            PointResult pr = byPoint.get(normalizePointKey(rp.getPoint()));
            if (pr == null && points != null && i < points.size()) {
                pr = points.get(i);
            }
            RubricHit hit = new RubricHit();
            hit.setPoint(rp.getPoint());
            hit.setMaxScore(max);
            if (pr == null) {
                hit.setStatus("MISS");
                hit.setScore(BigDecimal.ZERO);
                hit.setReason("模型未返回该要点");
            } else {
                String status = normalizeStatus(pr.getStatus());
                BigDecimal score = pr.getScore() == null ? BigDecimal.ZERO : pr.getScore();
                if (score.compareTo(BigDecimal.ZERO) < 0) {
                    score = BigDecimal.ZERO;
                }
                if (score.compareTo(BigDecimal.valueOf(max)) > 0) {
                    score = BigDecimal.valueOf(max);
                }
                if ("HIT".equals(status) && score.compareTo(BigDecimal.ZERO) == 0 && max > 0) {
                    score = BigDecimal.valueOf(max);
                }
                if ("MISS".equals(status)) {
                    score = BigDecimal.ZERO;
                }
                hit.setStatus(status);
                hit.setScore(score);
                hit.setReason(pr.getReason());
            }
            hits.add(hit);
        }
        return hits;
    }

    private void finalizeGrading(Long gradingId, Counters counters) {
        Grading grading = gradingMapper.selectById(gradingId);
        if (grading == null) {
            return;
        }
        List<QuestionGrading> qgs = questionGradingMapper.selectByGradingId(gradingId);
        BigDecimal total = BigDecimal.ZERO;
        int failCount = 0;
        for (QuestionGrading qg : qgs) {
            if (qg.getScore() != null) {
                total = total.add(qg.getScore());
            }
            if (qg.getErrorMsg() != null && !qg.getErrorMsg().isBlank()
                    && !Boolean.TRUE.equals(qg.getManualOverride())) {
                failCount++;
            }
        }
        String status;
        if (failCount == 0) {
            status = "SUCCESS";
        } else if (failCount < qgs.size()) {
            status = "PARTIAL";
        } else {
            status = "FAILED";
        }

        grading.setStatus(status);
        grading.setTotalScore(total);
        grading.setPromptTokens(counters.promptTokens.get());
        grading.setCompletionTokens(counters.completionTokens.get());
        grading.setCostMs(counters.costMs.get());
        if (failCount > 0) {
            grading.setErrorMsg(failCount + " 道题阅卷失败，可在报告页单题重试");
        }
        gradingMapper.updateById(grading);

        syncExamScores(grading);
        updateWrongBook(grading);

        hub.emit(gradingId, "done", Map.of(
                "status", status,
                "totalScore", total,
                "fullScore", grading.getFullScore(),
                "errorMsg", Objects.toString(grading.getErrorMsg(), "")));
        log.info("阅卷 {} 完成：{}，得分 {}/{}", gradingId, status, total, grading.getFullScore());
    }

    private void recalculateTotals(Grading grading) {
        List<QuestionGrading> qgs = questionGradingMapper.selectByGradingId(grading.getId());
        BigDecimal total = qgs.stream()
                .map(q -> q.getScore() == null ? BigDecimal.ZERO : q.getScore())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int failCount = (int) qgs.stream()
                .filter(q -> q.getErrorMsg() != null && !q.getErrorMsg().isBlank()
                        && !Boolean.TRUE.equals(q.getManualOverride()))
                .count();
        grading.setTotalScore(total);
        if (failCount == 0) {
            grading.setStatus("SUCCESS");
            grading.setErrorMsg(null);
        } else if (failCount < qgs.size()) {
            grading.setStatus("PARTIAL");
        } else {
            grading.setStatus("FAILED");
        }
        gradingMapper.updateById(grading);
    }

    private void syncExamScores(Grading grading) {
        Exam exam = examMapper.selectById(grading.getExamId());
        if (exam == null) {
            return;
        }
        exam.setTotalScore(grading.getTotalScore());
        exam.setFullScore(grading.getFullScore());
        exam.setScoreRate(LocalScorer.rate(
                grading.getTotalScore() == null ? BigDecimal.ZERO : grading.getTotalScore(),
                grading.getFullScore() == null ? 0 : grading.getFullScore()));
        if (isTerminal(grading.getStatus())) {
            exam.setStatus("GRADED");
        }
        examMapper.updateById(exam);
    }

    private void updateWrongBook(Grading grading) {
        List<QuestionGrading> qgs = questionGradingMapper.selectByGradingId(grading.getId());
        for (QuestionGrading qg : qgs) {
            if (qg.getErrorMsg() != null && !qg.getErrorMsg().isBlank()) {
                continue;
            }
            if (qg.getFullScore() == null || qg.getFullScore() <= 0 || qg.getScore() == null) {
                continue;
            }
            BigDecimal rate = LocalScorer.rate(qg.getScore(), qg.getFullScore());
            WrongQuestion existing = wrongQuestionMapper.selectByQuestionId(qg.getQuestionId());

            if (rate.doubleValue() < wrongBookThreshold) {
                if (existing == null) {
                    WrongQuestion w = new WrongQuestion();
                    w.setQuestionId(qg.getQuestionId());
                    w.setWrongCount(1);
                    w.setPassStreak(0);
                    w.setLastScoreRate(rate);
                    w.setLastWrongAt(LocalDateTime.now());
                    w.setStatus("ACTIVE");
                    w.setManualAdded(false);
                    wrongQuestionMapper.insert(w);
                } else {
                    existing.setWrongCount(nvl(existing.getWrongCount()) + 1);
                    existing.setPassStreak(0);
                    existing.setLastScoreRate(rate);
                    existing.setLastWrongAt(LocalDateTime.now());
                    existing.setStatus("ACTIVE");
                    wrongQuestionMapper.updateById(existing);
                }
            } else if (existing != null && "ACTIVE".equals(existing.getStatus())) {
                int streak = nvl(existing.getPassStreak()) + 1;
                existing.setPassStreak(streak);
                existing.setLastScoreRate(rate);
                if (streak >= 2) {
                    existing.setStatus("MASTERED");
                }
                wrongQuestionMapper.updateById(existing);
            }
        }
    }

    /* ========================================================== 辅助 */

    /** 填空题前端存 JSON 数组，报告里展示为可读文本。 */
    private String displayAnswer(QuestionType type, String content) {
        if (content == null) {
            return null;
        }
        if (type == QuestionType.FILL_BLANK) {
            String t = content.trim();
            if (t.startsWith("[") && t.endsWith("]")) {
                try {
                    List<String> parts = converter.parseList(t, new TypeReference<>() {});
                    return String.join(" | ", parts);
                } catch (Exception ignored) {
                    return content;
                }
            }
        }
        return content;
    }

    private boolean examNeedsModel(Long examId) {
        List<ExamQuestion> links = examQuestionMapper.selectByExamId(examId);
        if (links.isEmpty()) {
            return false;
        }
        List<Long> qids = links.stream().map(ExamQuestion::getQuestionId).toList();
        for (Question q : questionMapper.selectBatchIds(qids)) {
            if (QuestionConverter.isSubjective(q.getType()) || q.getType() == QuestionType.FILL_BLANK) {
                return true;
            }
        }
        return false;
    }

    private ModelProfile resolveGradeModel(Long gradingModelId) {
        ModelProfile model = gradingModelId != null
                ? modelService.getRequired(gradingModelId)
                : modelService.getDefaultFor(false);
        if (!Boolean.TRUE.equals(model.getCanGrade())) {
            throw new BizException("该模型未启用「可用于阅卷」，请到模型管理开启");
        }
        if (!Boolean.TRUE.equals(model.getEnabled())) {
            throw new BizException("该模型已禁用");
        }
        return model;
    }

    private GradingDTO.GradingView toView(Grading g) {
        GradingDTO.GradingView v = new GradingDTO.GradingView();
        v.setId(g.getId());
        v.setExamId(g.getExamId());
        v.setModelProfileId(g.getModelProfileId());
        v.setModelSnapshot(g.getModelSnapshot());
        v.setStatus(g.getStatus());
        v.setTotalScore(g.getTotalScore());
        v.setFullScore(g.getFullScore());
        v.setScoreRate(LocalScorer.rate(
                g.getTotalScore() == null ? BigDecimal.ZERO : g.getTotalScore(),
                g.getFullScore() == null ? 0 : g.getFullScore()));
        List<QuestionGrading> qgs = questionGradingMapper.selectByGradingId(g.getId());
        v.setGradedCount(qgs.size());
        Exam exam = examMapper.selectById(g.getExamId());
        v.setQuestionCount(exam == null ? qgs.size() : exam.getQuestionCount());
        v.setPromptTokens(g.getPromptTokens());
        v.setCompletionTokens(g.getCompletionTokens());
        v.setCostMs(g.getCostMs());
        v.setErrorMsg(g.getErrorMsg());
        v.setCreatedAt(g.getCreatedAt());
        v.setUpdatedAt(g.getUpdatedAt());
        return v;
    }

    private Map<String, Object> liveProgress(Long gradingId, int graded, int total, Counters counters) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("graded", graded);
        m.put("total", total);
        m.put("promptTokens", counters.promptTokens.get());
        m.put("completionTokens", counters.completionTokens.get());
        m.put("costMs", counters.costMs.get());
        m.put("status", "RUNNING");
        Grading g = gradingMapper.selectById(gradingId);
        if (g != null) {
            m.put("totalScore", g.getTotalScore());
            m.put("fullScore", g.getFullScore());
        }
        return m;
    }

    private String buildRubricBlock(List<QuestionBatchDTO.RubricPoint> rubric) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < rubric.size(); i++) {
            QuestionBatchDTO.RubricPoint rp = rubric.get(i);
            sb.append(i + 1).append(". [").append(rp.getScore()).append("分] ")
                    .append(rp.getPoint()).append('\n');
        }
        return sb.toString().trim();
    }

    private String zeroRubricJson(Question q) {
        List<QuestionBatchDTO.RubricPoint> rubric =
                converter.parseList(q.getRubricJson(), new TypeReference<>() {});
        List<RubricHit> hits = new ArrayList<>();
        for (QuestionBatchDTO.RubricPoint rp : rubric) {
            RubricHit h = new RubricHit();
            h.setPoint(rp.getPoint());
            h.setMaxScore(rp.getScore());
            h.setStatus("MISS");
            h.setScore(BigDecimal.ZERO);
            h.setReason("未作答");
            hits.add(h);
        }
        return converter.toJson(hits);
    }

    private List<RubricHit> parseRubricResult(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return converter.parseList(json, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private ChatResponse callModel(ChatModel model, String prompt) {
        try {
            concurrencyGate.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("阅卷线程被中断", e);
        }
        try {
            return model.call(new Prompt(prompt));
        } finally {
            concurrencyGate.release();
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

    private static String normalizeStatus(String s) {
        if (s == null) {
            return "MISS";
        }
        String v = s.trim().toUpperCase();
        return switch (v) {
            case "HIT", "命中", "完全命中", "FULL" -> "HIT";
            case "PARTIAL", "部分", "部分命中" -> "PARTIAL";
            default -> "MISS";
        };
    }

    private static String normalizePointKey(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").toLowerCase();
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

    private static int nvl(Integer v) {
        return v == null ? 0 : v;
    }

    private static class Counters {
        final AtomicInteger promptTokens = new AtomicInteger();
        final AtomicInteger completionTokens = new AtomicInteger();
        final AtomicLong costMs = new AtomicLong();
        final AtomicInteger failures = new AtomicInteger();
    }

    private static class Agg {
        BigDecimal earned = BigDecimal.ZERO;
        int full;
        int count;

        void add(BigDecimal e, int f) {
            earned = earned.add(e);
            full += f;
            count++;
        }
    }
}
