package com.codespar.model.dto;

import com.codespar.model.dto.ExamDTO.ExamListItem;
import com.codespar.model.enums.QuestionType;
import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** 能力仪表盘（PRD F7.1 / F7.3）。 */
public class DashboardDTO {

    @Data
    public static class View {
        private Totals totals = new Totals();
        /** 最弱标签（优先样本充足），供「针对此项出题」 */
        private List<TagStat> weakTags = new ArrayList<>();
        /** 全部标签，按得分率从低到高 */
        private List<TagStat> allTags = new ArrayList<>();
        private List<TypeStat> typeScores = new ArrayList<>();
        private List<TrendPoint> trend = new ArrayList<>();
        private List<TagTrend> tagTrends = new ArrayList<>();
        private List<ExamListItem> recentExams = new ArrayList<>();
        /** 标签「样本不足」阈值（题量） */
        private int minTagSample;
    }

    @Data
    public static class Totals {
        /** 已阅卷且有可用成绩的场次 */
        private int gradedExamCount;
        /** 未开始 + 作答中 */
        private int openExamCount;
        /** 已交卷待阅卷 / 阅卷中 */
        private int submittedExamCount;
        /** 阅卷成功计入的作答题数（重刷计一次） */
        private int gradedQuestionCount;
        private long generationTokens;
        private long gradingTokens;
        private long tokenTotal;
        private int wrongQuestionCount;
        /** 按满分加权的整体得分率 */
        private BigDecimal overallScoreRate;
        private BigDecimal earned;
        private int full;
    }

    @Data
    public static class TagStat {
        private String tag;
        private BigDecimal earned;
        private int full;
        private BigDecimal rate;
        private int questionCount;
        private boolean sampleInsufficient;
    }

    @Data
    public static class TypeStat {
        private QuestionType type;
        private BigDecimal earned;
        private int full;
        private BigDecimal rate;
        private int questionCount;
    }

    @Data
    public static class TrendPoint {
        private String day;
        private int examCount;
        private int questionCount;
        private BigDecimal earned;
        private int full;
        private BigDecimal rate;
    }

    @Data
    public static class TagTrend {
        private String tag;
        private List<TrendPoint> points = new ArrayList<>();
    }

    /** Mapper 行：累计 */
    @Data
    public static class TotalsRow {
        private Long gradedExamCount;
        private Long openExamCount;
        private Long submittedExamCount;
        private Long generationTokens;
        private Long gradingTokens;
        private Long wrongQuestionCount;
        private BigDecimal earned;
        private Long full;
    }

    /** Mapper 行：标签 / 题型聚合 */
    @Data
    public static class AggRow {
        private String tag;
        private String type;
        private BigDecimal earned;
        private BigDecimal full;
        private Long questionCount;
    }

    /** Mapper 行：按日聚合 */
    @Data
    public static class DayRow {
        private String tag;
        private String day;
        private Long examCount;
        private Long questionCount;
        private BigDecimal earned;
        private BigDecimal full;
    }
}
