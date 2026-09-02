package com.codespar.model.dto;

import com.codespar.ai.QuestionBatchDTO;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/** 模考答题（P4）相关 DTO。 */
public class ExamDTO {

    /** 试卷列表项。 */
    @Data
    public static class ExamListItem {
        private Long id;
        private String name;
        private String category;
        private String categoryLabel;
        private String source;
        private String status;
        private Integer questionCount;
        private Integer fullScore;
        private java.math.BigDecimal totalScore;
        private java.math.BigDecimal scoreRate;
        private Integer timeLimitMin;
        private Long originExamId;
        private Long articleId;
        private LocalDateTime startedAt;
        private LocalDateTime submittedAt;
        private Integer durationSec;
        private LocalDateTime createdAt;
    }

    /**
     * 答题用详情。questions 不含参考答案 / 评分要点 / 正确答案 / 解析。
     */
    @Data
    public static class ExamDetail {
        private Long id;
        private String name;
        private String category;
        private String categoryLabel;
        private String source;
        private String status;
        private Integer questionCount;
        private Integer fullScore;
        private Integer timeLimitMin;
        private LocalDateTime startedAt;
        private LocalDateTime submittedAt;
        private Integer durationSec;
        private LocalDateTime createdAt;
        private List<QuestionForTaking> questions;
    }

    /** 答题页可见的题目字段 —— 刻意不含答案侧信息。 */
    @Data
    public static class QuestionForTaking {
        private Long id;
        private Integer seq;
        private QuestionType type;
        private QuestionDifficulty difficulty;
        private String stem;
        private List<QuestionBatchDTO.Option> options;
        private Integer fullScore;
    }

    @Data
    public static class AnswerView {
        private Long questionId;
        private String content;
        private Boolean flagged;
        private LocalDateTime updatedAt;
    }

    /** 开考。timeLimitMin 仅在首次开考时生效；空 = 不限时。 */
    @Data
    public static class StartRequest {
        private Integer timeLimitMin;
    }

    /** 保存/更新单题作答。字段均可选，只更新传入的。 */
    @Data
    public static class SaveAnswerRequest {
        private String content;
        private Boolean flagged;
    }

    @Data
    public static class SubmitRequest {
        /** 阅卷模型；空则用默认阅卷模型。 */
        private Long gradingModelId;
    }

    @Data
    public static class SubmitResult {
        private Long examId;
        private String status;
        private Integer unansweredCount;
        private Integer durationSec;
        /** 交卷后自动启动的阅卷任务 id */
        private Long gradingId;

        public static SubmitResult of(Long examId, String status, int unanswered,
                                      Integer durationSec, Long gradingId) {
            SubmitResult r = new SubmitResult();
            r.examId = examId;
            r.status = status;
            r.unansweredCount = unanswered;
            r.durationSec = durationSec;
            r.gradingId = gradingId;
            return r;
        }
    }
}
