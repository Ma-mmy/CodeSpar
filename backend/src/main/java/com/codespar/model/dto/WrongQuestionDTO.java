package com.codespar.model.dto;

import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** 错题本。 */
public class WrongQuestionDTO {

    @Data
    public static class ListView {
        private List<Item> items = new ArrayList<>();
        /** 当前状态下出现过的标签，供筛选 */
        private List<String> tags = new ArrayList<>();
    }

    @Data
    public static class Item {
        private Long id;
        private Long questionId;
        private QuestionType type;
        private QuestionDifficulty difficulty;
        private String stem;
        private String referenceAnswer;
        private String correctAnswer;
        private String explanation;
        private Integer fullScore;
        private List<String> tags = new ArrayList<>();
        private Integer wrongCount;
        private Integer passStreak;
        private BigDecimal lastScoreRate;
        private BigDecimal lastScore;
        private String lastComment;
        private String lastAnswer;
        private LocalDateTime lastWrongAt;
        private String status;
        private Boolean manualAdded;
        private LocalDateTime createdAt;
    }

    @Data
    public static class AddRequest {
        @NotNull(message = "请指定题目")
        private Long questionId;
    }

    @Data
    public static class ComposeRequest {
        /** 勾选的题目；空则按当前筛选取 */
        private List<Long> questionIds;
        /** 按标签筛（仅 questionIds 为空时生效） */
        private String tag;
        /** 是否包含已掌握；默认否 */
        private Boolean includeMastered;
        /** 组卷题量上限，默认 10，最大 30 */
        private Integer limit;
    }

    /** Mapper 行 */
    @Data
    public static class Row {
        private Long id;
        private Long questionId;
        private Integer wrongCount;
        private Integer passStreak;
        private BigDecimal lastScoreRate;
        private LocalDateTime lastWrongAt;
        private String status;
        private Boolean manualAdded;
        private LocalDateTime createdAt;
        private String stem;
        private String type;
        private String difficulty;
        private Integer fullScore;
        private String referenceAnswer;
        private String correctAnswer;
        private String explanation;
        private BigDecimal lastScore;
        private String lastComment;
        private String lastAnswer;
    }

    @Data
    public static class TagNameRow {
        private Long questionId;
        private String name;
    }
}
