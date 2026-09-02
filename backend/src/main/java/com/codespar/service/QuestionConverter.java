package com.codespar.service;

import com.codespar.ai.QuestionBatchDTO;
import com.codespar.ai.QuestionBatchDTO.Option;
import com.codespar.ai.QuestionBatchDTO.QuestionDTO;
import com.codespar.ai.QuestionBatchDTO.RubricPoint;
import com.codespar.model.dto.GenerationDTO.QuestionView;
import com.codespar.model.entity.Question;

import com.codespar.model.enums.QuestionType;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 题目实体的双向转换与业务校验。
 * <p>出题、单题重生成共用同一套规则 —— 校验不过抛 {@link IllegalArgumentException}，
 * 上层把它变成重试或明确报错。
 */
@Component
@RequiredArgsConstructor
public class QuestionConverter {

    private final ObjectMapper objectMapper;
    private final QuestionTaggingService tagging;

    /** 各题型的默认满分（模型没给 fullScore 时兜底）。 */
    private static int defaultScore(QuestionType type) {
        return switch (type) {
            case SINGLE_CHOICE, TRUE_FALSE, FILL_BLANK -> 5;
            case MULTI_CHOICE, SHORT_ANSWER -> 10;
            case SYSTEM_DESIGN -> 20;
        };
    }

    public static boolean isSubjective(QuestionType type) {
        return type == QuestionType.SHORT_ANSWER || type == QuestionType.SYSTEM_DESIGN;
    }

    /**
     * 模型输出的题目 → 实体（含业务校验）。
     * type 强制用本批题型 —— 模型偶尔会把 type 写错。
     */
    public Question toEntity(QuestionType expectedType, QuestionDTO dto) {
        if (dto.getStem() == null || dto.getStem().isBlank()) {
            throw new IllegalArgumentException("有题目缺少题干");
        }
        if (dto.getDifficulty() == null) {
            throw new IllegalArgumentException("有题目缺少难度");
        }

        Question q = new Question();
        q.setType(expectedType);
        q.setDifficulty(dto.getDifficulty());
        q.setStem(dto.getStem().trim());
        q.setStatus("DRAFT");
        q.setEditedByUser(false);
        q.setFullScore(dto.getFullScore() == null ? defaultScore(expectedType) : dto.getFullScore());
        if (q.getFullScore() <= 0) {
            throw new IllegalArgumentException("fullScore 必须大于 0");
        }
        q.setReferenceAnswer(dto.getReferenceAnswer());
        q.setExplanation(dto.getExplanation());

        switch (expectedType) {
            case SINGLE_CHOICE, MULTI_CHOICE, TRUE_FALSE -> {
                if (dto.getOptions() == null || dto.getOptions().size() < 2) {
                    throw new IllegalArgumentException("选择题选项不足");
                }
                for (Option o : dto.getOptions()) {
                    if (o.getKey() == null || o.getKey().isBlank() || o.getText() == null || o.getText().isBlank()) {
                        throw new IllegalArgumentException("选择题选项不完整");
                    }
                }
                if (dto.getCorrectAnswer() == null || dto.getCorrectAnswer().isBlank()) {
                    throw new IllegalArgumentException("缺少正确选项 correctAnswer");
                }
                q.setOptionsJson(toJson(dto.getOptions()));
                q.setCorrectAnswer(dto.getCorrectAnswer().trim());
            }
            case FILL_BLANK -> {
                if (dto.getAcceptedAnswers() == null || dto.getAcceptedAnswers().isEmpty()) {
                    throw new IllegalArgumentException("填空题缺少标准答案 acceptedAnswers");
                }
                q.setAcceptedAnswers(toJson(dto.getAcceptedAnswers()));
                q.setCorrectAnswer(dto.getAcceptedAnswers().get(0));
            }
            case SHORT_ANSWER, SYSTEM_DESIGN -> {
                if (dto.getReferenceAnswer() == null || dto.getReferenceAnswer().isBlank()) {
                    throw new IllegalArgumentException("主观题缺少参考答案");
                }
                if (dto.getRubric() == null || dto.getRubric().isEmpty()) {
                    throw new IllegalArgumentException("主观题缺少评分要点 rubric");
                }
                int sum = dto.getRubric().stream().mapToInt(r -> r.getScore() == null ? 0 : r.getScore()).sum();
                if (sum != q.getFullScore()) {
                    throw new IllegalArgumentException(
                            "评分要点分值之和(" + sum + ")不等于满分(" + q.getFullScore() + ")");
                }
            }
        }

        // 模型带了 rubric 就存（客观题阅卷时本地判分用不上，留作参考）
        if (dto.getRubric() != null && !dto.getRubric().isEmpty()) {
            q.setRubricJson(toJson(dto.getRubric()));
        }
        return q;
    }

    /** 实体 → 前端视图。tags 由调用方从标签服务取。 */
    public QuestionView toView(Question q, List<String> tags) {
        QuestionView v = new QuestionView();
        v.setId(q.getId());
        v.setType(q.getType());
        v.setDifficulty(q.getDifficulty());
        v.setStem(q.getStem());
        v.setOptions(parseList(q.getOptionsJson(), new TypeReference<>() {}));
        v.setCorrectAnswer(q.getCorrectAnswer());
        v.setAcceptedAnswers(parseList(q.getAcceptedAnswers(), new TypeReference<>() {}));
        v.setReferenceAnswer(q.getReferenceAnswer());
        v.setRubric(parseList(q.getRubricJson(), new TypeReference<>() {}));
        v.setFullScore(q.getFullScore());
        v.setExplanation(q.getExplanation());
        v.setTags(tags);
        v.setEditedByUser(Boolean.TRUE.equals(q.getEditedByUser()));
        v.setStatus(q.getStatus());
        return v;
    }

    /** 模型打的标签 ∪ 用户指定的标签，并归一到主分类白名单。 */
    public List<String> mergeTags(List<String> modelTags, List<String> userTags) {
        return mergeTags(modelTags, userTags, (String) null);
    }

    public List<String> mergeTags(List<String> modelTags, List<String> userTags, String fallbackLabel) {
        List<String> merged = new ArrayList<>();
        if (modelTags != null) merged.addAll(modelTags);
        if (userTags != null) merged.addAll(userTags);
        return tagging.canonicalize(merged, fallbackLabel);
    }

    public String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 序列化失败", e);
        }
    }

    public <T> List<T> parseList(String json, TypeReference<List<T>> ref) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, ref);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 反序列化失败：" + json, e);
        }
    }
}
