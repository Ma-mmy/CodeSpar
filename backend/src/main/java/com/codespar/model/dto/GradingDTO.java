package com.codespar.model.dto;

import com.codespar.ai.QuestionBatchDTO;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** 阅卷（P5）相关 DTO。 */
public class GradingDTO {

    @Data
    public static class SubmitRequest {
        /** 阅卷模型；空则用默认阅卷模型。纯客观卷也可传，本地判分不消耗 token。 */
        private Long gradingModelId;
    }

    @Data
    public static class OverrideRequest {
        @NotNull
        @DecimalMin("0")
        private BigDecimal score;
        private String reason;
    }

    @Data
    public static class GradingView {
        private Long id;
        private Long examId;
        private Long modelProfileId;
        private String modelSnapshot;
        private String status;
        private BigDecimal totalScore;
        private Integer fullScore;
        private BigDecimal scoreRate;
        private Integer gradedCount;
        private Integer questionCount;
        private Integer promptTokens;
        private Integer completionTokens;
        private Long costMs;
        private String errorMsg;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    /** 成绩报告：试卷元信息 + 阅卷汇总 + 逐题详情 + 标签得分。 */
    @Data
    public static class ReportView {
        private Long examId;
        private String examName;
        private String examStatus;
        private Integer questionCount;
        private Integer fullScore;
        private Integer durationSec;
        private LocalDateTime startedAt;
        private LocalDateTime submittedAt;
        /** 重刷卷指向原卷，便于对比得分 */
        private Long originExamId;
        private BigDecimal originTotalScore;
        private BigDecimal originScoreRate;
        private GradingView grading;
        private List<TagScore> tagScores;
        private List<TypeScore> typeScores;
        private List<QuestionReport> questions;
    }

    @Data
    public static class TagScore {
        private String tag;
        private BigDecimal earned;
        private Integer full;
        private BigDecimal rate;
        private Integer questionCount;
    }

    @Data
    public static class TypeScore {
        private QuestionType type;
        private BigDecimal earned;
        private Integer full;
        private BigDecimal rate;
        private Integer questionCount;
    }

    @Data
    public static class QuestionReport {
        private Long questionId;
        private Integer seq;
        private QuestionType type;
        private QuestionDifficulty difficulty;
        private String stem;
        private List<QuestionBatchDTO.Option> options;
        private String correctAnswer;
        private List<String> acceptedAnswers;
        private String referenceAnswer;
        private String explanation;
        private List<QuestionBatchDTO.RubricPoint> rubric;
        private List<String> tags;
        private Integer fullScore;
        private String userAnswer;
        private Boolean flagged;
        private BigDecimal score;
        private String comment;
        private String gradedBy;
        private Boolean manualOverride;
        private String overrideReason;
        private String errorMsg;
        private List<RubricHit> rubricResult;
        private Boolean inWrongBook;
    }

    @Data
    public static class RubricHit {
        private String point;
        private Integer maxScore;
        private String status; // HIT / PARTIAL / MISS
        private BigDecimal score;
        private String reason;
    }

    /** 模型主观题阅卷输出。 */
    @Data
    public static class SubjectiveGradeResult {
        private List<PointResult> points;
        private String comment;
    }

    @Data
    public static class PointResult {
        private String point;
        private String status;
        private BigDecimal score;
        private String reason;
    }

    /** 填空题语义等价判定输出。 */
    @Data
    public static class FillEquivResult {
        private Boolean equivalent;
        private String reason;
    }
}
