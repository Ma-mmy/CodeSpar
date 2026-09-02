package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.ai.QuestionBatchDTO;
import com.codespar.mapper.AnswerMapper;
import com.codespar.mapper.ExamMapper;
import com.codespar.mapper.ExamQuestionMapper;
import com.codespar.mapper.GenerationJobMapper;
import com.codespar.mapper.GradingMapper;
import com.codespar.mapper.QuestionGradingMapper;
import com.codespar.mapper.QuestionMapper;
import com.codespar.model.dto.ExamDTO;
import com.codespar.model.dto.ExamDTO.AnswerView;
import com.codespar.model.dto.ExamDTO.ExamDetail;
import com.codespar.model.dto.ExamDTO.ExamListItem;
import com.codespar.model.dto.ExamDTO.QuestionForTaking;
import com.codespar.model.dto.ExamDTO.SaveAnswerRequest;
import com.codespar.model.dto.ExamDTO.StartRequest;
import com.codespar.model.dto.ExamDTO.SubmitResult;
import com.codespar.model.entity.Answer;
import com.codespar.model.entity.Exam;
import com.codespar.model.entity.ExamQuestion;
import com.codespar.model.entity.GenerationJob;
import com.codespar.model.entity.Grading;
import com.codespar.model.entity.Question;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.core.type.TypeReference;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 模考答题（P4）。交卷落到 SUBMITTED；阅卷由 Controller 在事务提交后触发。
 */
@Service
@RequiredArgsConstructor
public class ExamService {

    private static final Set<String> TAKEABLE = Set.of("NOT_STARTED", "IN_PROGRESS");
    private static final Set<String> READONLY = Set.of("SUBMITTED", "GRADED");
    /** 文章开卷弹窗里的历史卷条数上限。 */
    static final int ARTICLE_HISTORY_LIMIT = 3;

    private final ExamMapper examMapper;
    private final ExamQuestionMapper examQuestionMapper;
    private final QuestionMapper questionMapper;
    private final AnswerMapper answerMapper;
    private final GradingMapper gradingMapper;
    private final QuestionGradingMapper questionGradingMapper;
    private final GenerationJobMapper generationJobMapper;
    private final QuestionConverter converter;
    private final CategoryService categoryService;

    public List<ExamListItem> list() {
        return examMapper.selectList(Wrappers.<Exam>lambdaQuery()
                        .orderByDesc(Exam::getId))
                .stream()
                .map(this::toListItem)
                .toList();
    }

    /**
     * 文章开卷的历史卷。确认组卷后即出现，不限作答/阅卷状态；只返回最近
     * {@link #ARTICLE_HISTORY_LIMIT} 套。同时纳入「出题任务挂了文章、试卷行漏了
     * article_id」的旧数据并回填。
     */
    public List<ExamListItem> listByArticle(Long articleId) {
        if (articleId == null) {
            return List.of();
        }
        Map<Long, Exam> byId = new LinkedHashMap<>();
        for (Exam e : examMapper.selectList(Wrappers.<Exam>lambdaQuery()
                .eq(Exam::getArticleId, articleId)
                .orderByDesc(Exam::getId)
                .last("LIMIT " + ARTICLE_HISTORY_LIMIT))) {
            byId.put(e.getId(), e);
        }
        List<Long> jobIds = generationJobMapper.selectList(Wrappers.<GenerationJob>lambdaQuery()
                        .eq(GenerationJob::getArticleId, articleId))
                .stream()
                .map(GenerationJob::getId)
                .filter(Objects::nonNull)
                .toList();
        if (!jobIds.isEmpty()) {
            for (Exam e : examMapper.selectList(Wrappers.<Exam>lambdaQuery()
                    .in(Exam::getJobId, jobIds)
                    .orderByDesc(Exam::getId)
                    .last("LIMIT " + ARTICLE_HISTORY_LIMIT))) {
                byId.putIfAbsent(e.getId(), e);
            }
        }
        List<Exam> recent = byId.values().stream()
                .sorted(Comparator.comparing(Exam::getId).reversed())
                .limit(ARTICLE_HISTORY_LIMIT)
                .toList();
        for (Exam stored : recent) {
            if (stored.getArticleId() == null) {
                Exam patch = new Exam();
                patch.setId(stored.getId());
                patch.setArticleId(articleId);
                examMapper.updateById(patch);
                stored.setArticleId(articleId);
            }
        }
        return recent.stream().map(this::toListItem).toList();
    }

    /**
     * 清空答题记录：擦除作答与阅卷，试卷回到未开始（题目不变）。
     */
    @Transactional
    public ExamDetail clearAnswers(Long examId) {
        Exam exam = getRequired(examId);
        for (Grading g : gradingMapper.selectByExamId(examId)) {
            questionGradingMapper.deleteByGradingId(g.getId());
        }
        gradingMapper.deleteByExamId(examId);
        answerMapper.deleteByExamId(examId);
        // MyBatis-Plus 默认忽略 null 字段，需显式清空时间与成绩
        examMapper.update(null, Wrappers.<Exam>lambdaUpdate()
                .eq(Exam::getId, examId)
                .set(Exam::getStatus, "NOT_STARTED")
                .set(Exam::getTotalScore, null)
                .set(Exam::getScoreRate, null)
                .set(Exam::getStartedAt, null)
                .set(Exam::getSubmittedAt, null)
                .set(Exam::getDurationSec, null)
                .set(Exam::getGradingModelProfileId, null));
        return getForTaking(examId);
    }

    public Exam getRequired(Long id) {
        Exam exam = examMapper.selectById(id);
        if (exam == null) {
            throw new BizException("试卷不存在：" + id);
        }
        return exam;
    }

    /**
     * 答题用详情。题目字段刻意剥离参考答案 / 评分要点 / 正确答案 / 解析。
     * SUBMITTED/GRADED 也可读（列表「查看」进报告前可能先拉详情）。
     */
    public ExamDetail getForTaking(Long id) {
        Exam exam = getRequired(id);
        ExamDetail detail = toDetailShell(exam);
        List<ExamQuestion> links = examQuestionMapper.selectByExamId(id);
        if (links.isEmpty()) {
            detail.setQuestions(List.of());
            return detail;
        }
        List<Long> qids = links.stream().map(ExamQuestion::getQuestionId).toList();
        Map<Long, Question> byId = new HashMap<>();
        for (Question q : questionMapper.selectBatchIds(qids)) {
            byId.put(q.getId(), q);
        }
        List<QuestionForTaking> questions = new ArrayList<>();
        for (ExamQuestion link : links) {
            Question q = byId.get(link.getQuestionId());
            if (q == null) {
                continue;
            }
            questions.add(toTakingQuestion(link.getSeq(), q));
        }
        detail.setQuestions(questions);
        return detail;
    }

    public List<AnswerView> listAnswers(Long examId) {
        getRequired(examId);
        return answerMapper.selectByExamId(examId).stream().map(this::toAnswerView).toList();
    }

    /**
     * 开考。NOT_STARTED → IN_PROGRESS；已 IN_PROGRESS 幂等返回。
     * timeLimitMin 仅首次开考生效。
     */
    @Transactional
    public ExamDetail start(Long id, StartRequest req) {
        Exam exam = getRequired(id);
        if (READONLY.contains(exam.getStatus())) {
            throw new BizException("试卷已交卷，不能再次开考");
        }
        if ("NOT_STARTED".equals(exam.getStatus())) {
            exam.setStatus("IN_PROGRESS");
            exam.setStartedAt(LocalDateTime.now());
            if (req != null && req.getTimeLimitMin() != null && req.getTimeLimitMin() > 0) {
                exam.setTimeLimitMin(req.getTimeLimitMin());
            }
            examMapper.updateById(exam);
        }
        return getForTaking(id);
    }

    /** 保存/更新单题作答。仅 IN_PROGRESS。 */
    @Transactional
    public AnswerView saveAnswer(Long examId, Long questionId, SaveAnswerRequest req) {
        Exam exam = getRequired(examId);
        if (!"IN_PROGRESS".equals(exam.getStatus())) {
            throw new BizException("只有作答中的试卷可以保存答案");
        }
        ensureQuestionOnExam(examId, questionId);

        Answer existing = answerMapper.selectByExamAndQuestion(examId, questionId);
        if (existing == null) {
            Answer a = new Answer();
            a.setExamId(examId);
            a.setQuestionId(questionId);
            a.setContent(req.getContent());
            a.setFlagged(Boolean.TRUE.equals(req.getFlagged()));
            answerMapper.insert(a);
            return toAnswerView(answerMapper.selectById(a.getId()));
        }

        if (req.getContent() != null) {
            existing.setContent(req.getContent());
        }
        if (req.getFlagged() != null) {
            existing.setFlagged(req.getFlagged());
        }
        answerMapper.updateById(existing);
        return toAnswerView(answerMapper.selectById(existing.getId()));
    }

    /**
     * 交卷 → SUBMITTED。允许未答完；返回未答题数。
     * 阅卷启动放在事务外（见 ExamController），避免异步线程读到未提交状态。
     */
    @Transactional
    public SubmitResult submit(Long examId, Long gradingModelId) {
        Exam exam = getRequired(examId);
        if (!"IN_PROGRESS".equals(exam.getStatus())) {
            throw new BizException("只有作答中的试卷可以交卷");
        }

        List<ExamQuestion> links = examQuestionMapper.selectByExamId(examId);
        Map<Long, Answer> answers = new HashMap<>();
        for (Answer a : answerMapper.selectByExamId(examId)) {
            answers.put(a.getQuestionId(), a);
        }
        int unanswered = 0;
        for (ExamQuestion link : links) {
            Answer a = answers.get(link.getQuestionId());
            if (a == null || a.getContent() == null || a.getContent().isBlank()) {
                unanswered++;
            }
        }

        LocalDateTime now = LocalDateTime.now();
        exam.setStatus("SUBMITTED");
        exam.setSubmittedAt(now);
        if (exam.getStartedAt() != null) {
            long sec = Duration.between(exam.getStartedAt(), now).getSeconds();
            exam.setDurationSec((int) Math.max(0, sec));
        }
        if (gradingModelId != null) {
            exam.setGradingModelProfileId(gradingModelId);
        }
        examMapper.updateById(exam);

        return SubmitResult.of(examId, exam.getStatus(), unanswered, exam.getDurationSec(), null);
    }

    /* ---------------------------------------------------------- 内部 */

    private void ensureQuestionOnExam(Long examId, Long questionId) {
        Long count = examQuestionMapper.selectCount(Wrappers.<ExamQuestion>lambdaQuery()
                .eq(ExamQuestion::getExamId, examId)
                .eq(ExamQuestion::getQuestionId, questionId));
        if (count == null || count == 0) {
            throw new BizException("题目不属于本试卷：" + questionId);
        }
    }

    /**
     * 删除试卷：作答、题序、阅卷记录一并删除；题目本身保留在题库。
     * 指向本卷的重刷卷 origin_exam_id 置空。
     */
    @Transactional
    public void delete(Long examId) {
        getRequired(examId);
        for (Grading g : gradingMapper.selectByExamId(examId)) {
            questionGradingMapper.deleteByGradingId(g.getId());
        }
        gradingMapper.deleteByExamId(examId);
        answerMapper.deleteByExamId(examId);
        examQuestionMapper.deleteByExamId(examId);
        examMapper.update(null, Wrappers.<Exam>lambdaUpdate()
                .eq(Exam::getOriginExamId, examId)
                .set(Exam::getOriginExamId, null));
        examMapper.deleteById(examId);
    }

    /**
     * 重刷此卷（P6）：复制原卷题目组成新卷，status=NOT_STARTED，source=RETAKE，
     * originExamId 指向原卷，便于对比两次得分。零成本，不调模型。
     */
    @Transactional
    public ExamDetail retake(Long examId) {
        Exam origin = getRequired(examId);
        if (!"SUBMITTED".equals(origin.getStatus()) && !"GRADED".equals(origin.getStatus())) {
            throw new BizException("只有已交卷或已阅卷的试卷可以重刷");
        }
        List<ExamQuestion> links = examQuestionMapper.selectByExamId(examId);
        if (links.isEmpty()) {
            throw new BizException("原卷没有题目，无法重刷");
        }

        Exam exam = new Exam();
        exam.setName(origin.getName() + "（重刷）");
        exam.setCategory(origin.getCategory());
        exam.setSource("RETAKE");
        exam.setJobId(origin.getJobId());
        exam.setOriginExamId(origin.getId());
        exam.setArticleId(origin.getArticleId());
        exam.setStatus("NOT_STARTED");
        exam.setTimeLimitMin(origin.getTimeLimitMin());
        exam.setQuestionCount(links.size());
        exam.setFullScore(origin.getFullScore());
        examMapper.insert(exam);

        int seq = 1;
        for (ExamQuestion link : links) {
            ExamQuestion eq = new ExamQuestion();
            eq.setExamId(exam.getId());
            eq.setQuestionId(link.getQuestionId());
            eq.setSeq(seq++);
            examQuestionMapper.insert(eq);
        }
        return getForTaking(exam.getId());
    }

    /**
     * 从已有题目组卷（错题本 / 题库挑题）。零成本，不调模型。
     */
    @Transactional
    public ExamDetail composeFromQuestions(String name, String source, String category, List<Long> questionIds) {
        if (questionIds == null || questionIds.isEmpty()) {
            throw new BizException("没有可组卷的题目");
        }
        List<Long> ids = questionIds.stream().distinct().toList();
        if (ids.size() > 30) {
            throw new BizException("单次组卷不超过 30 题");
        }
        Map<Long, Question> byId = new HashMap<>();
        for (Question q : questionMapper.selectBatchIds(ids)) {
            byId.put(q.getId(), q);
        }
        List<Question> ordered = new ArrayList<>();
        for (Long id : ids) {
            Question q = byId.get(id);
            if (q == null) {
                throw new BizException("题目不存在：" + id);
            }
            ordered.add(q);
        }

        Exam exam = new Exam();
        exam.setName(name == null || name.isBlank() ? "组卷" : name.trim());
        exam.setCategory(category);
        exam.setSource(source == null || source.isBlank() ? "MANUAL" : source);
        exam.setStatus("NOT_STARTED");
        exam.setQuestionCount(ordered.size());
        exam.setFullScore(ordered.stream().mapToInt(q -> q.getFullScore() == null ? 0 : q.getFullScore()).sum());
        examMapper.insert(exam);

        int seq = 1;
        for (Question q : ordered) {
            ExamQuestion eq = new ExamQuestion();
            eq.setExamId(exam.getId());
            eq.setQuestionId(q.getId());
            eq.setSeq(seq++);
            examQuestionMapper.insert(eq);
        }
        return getForTaking(exam.getId());
    }

    private ExamListItem toListItem(Exam e) {
        ExamListItem v = new ExamListItem();
        v.setId(e.getId());
        v.setName(e.getName());
        v.setCategory(e.getCategory());
        if (e.getCategory() != null && !e.getCategory().isBlank()) {
            v.setCategoryLabel(categoryService.labelOf(e.getCategory()));
        }
        v.setSource(e.getSource());
        v.setStatus(e.getStatus());
        v.setQuestionCount(e.getQuestionCount());
        v.setFullScore(e.getFullScore());
        v.setTotalScore(e.getTotalScore());
        v.setScoreRate(e.getScoreRate());
        v.setTimeLimitMin(e.getTimeLimitMin());
        v.setOriginExamId(e.getOriginExamId());
        v.setArticleId(e.getArticleId());
        v.setStartedAt(e.getStartedAt());
        v.setSubmittedAt(e.getSubmittedAt());
        v.setDurationSec(e.getDurationSec());
        v.setCreatedAt(e.getCreatedAt());
        return v;
    }

    private ExamDetail toDetailShell(Exam e) {
        ExamDetail v = new ExamDetail();
        v.setId(e.getId());
        v.setName(e.getName());
        v.setCategory(e.getCategory());
        if (e.getCategory() != null && !e.getCategory().isBlank()) {
            v.setCategoryLabel(categoryService.labelOf(e.getCategory()));
        }
        v.setSource(e.getSource());
        v.setStatus(e.getStatus());
        v.setQuestionCount(e.getQuestionCount());
        v.setFullScore(e.getFullScore());
        v.setTimeLimitMin(e.getTimeLimitMin());
        v.setStartedAt(e.getStartedAt());
        v.setSubmittedAt(e.getSubmittedAt());
        v.setDurationSec(e.getDurationSec());
        v.setCreatedAt(e.getCreatedAt());
        return v;
    }

    /** 答题可见字段 —— 不碰 correctAnswer / referenceAnswer / rubric / explanation。 */
    private QuestionForTaking toTakingQuestion(Integer seq, Question q) {
        QuestionForTaking v = new QuestionForTaking();
        v.setId(q.getId());
        v.setSeq(seq);
        v.setType(q.getType());
        v.setDifficulty(q.getDifficulty());
        v.setStem(q.getStem());
        v.setFullScore(q.getFullScore());
        List<QuestionBatchDTO.Option> options =
                converter.parseList(q.getOptionsJson(), new TypeReference<>() {});
        v.setOptions(options);
        return v;
    }

    private AnswerView toAnswerView(Answer a) {
        AnswerView v = new AnswerView();
        v.setQuestionId(a.getQuestionId());
        v.setContent(a.getContent());
        v.setFlagged(Boolean.TRUE.equals(a.getFlagged()));
        v.setUpdatedAt(a.getUpdatedAt());
        return v;
    }

    @SuppressWarnings("unused")
    private static boolean isTakeable(String status) {
        return TAKEABLE.contains(Objects.toString(status, ""));
    }
}
