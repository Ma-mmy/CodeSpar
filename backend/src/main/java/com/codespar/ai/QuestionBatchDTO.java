package com.codespar.ai;

import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;

import java.util.List;

/**
 * 模型出题输出的数据结构。
 * <p>生成试卷时输出 {@code {"questions":[...]}}；单题重生成时输出单个 QuestionDTO。
 * Option / RubricPoint 同时复用于前端 QuestionView。
 */
public class QuestionBatchDTO {

    @Data
    public static class Batch {
        private List<QuestionDTO> questions;
    }

    @Data
    public static class QuestionDTO {
        private QuestionType type;
        private QuestionDifficulty difficulty;
        private String stem;
        private List<String> tags;
        /** 仅选择题 */
        private List<Option> options;
        /** 选择/判断：正确选项 key；多选逗号分隔如 "A,C" */
        private String correctAnswer;
        /** 填空题：标准答案 + 可接受的同义表述 */
        private List<String> acceptedAnswers;
        /** 主观题参考答案（Markdown），也是复盘学习材料 */
        private String referenceAnswer;
        /** 评分要点，主观题必填，分值之和须等于 fullScore */
        private List<RubricPoint> rubric;
        private Integer fullScore;
        /** 客观题答案解析；主观题不要此字段 */
        private String explanation;
    }

    @Data
    public static class Option {
        @JsonAlias({"key", "字母", "k"})
        private String key;
        @JsonAlias({"text", "选项", "内容"})
        private String text;
    }

    @Data
    public static class RubricPoint {
        @JsonAlias({"point", "要点", "得分点", "name"})
        private String point;
        @JsonAlias({"score", "分值", "分"})
        private Integer score;
    }
}
