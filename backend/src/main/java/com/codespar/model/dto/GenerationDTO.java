package com.codespar.model.dto;

import com.codespar.ai.QuestionBatchDTO;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** 出题（P3）相关 DTO。 */
public class GenerationDTO {

    /** 出题请求。 */
    @Data
    public static class GenerateRequest {
        @NotBlank(message = "请描述想考什么")
        @Size(max = 5000, message = "提示词不超过 5000 字")
        private String prompt;

        /** 基于文章考点摘要出题时传入；长文摘要由服务端注入，不塞进 prompt */
        private Long articleId;

        /** 每种题型要几道（每种最多 20）；value 为 0 的题型不生成。整卷无单独总数上限。 */
        @NotNull(message = "请至少设置一种题型")
        private Map<QuestionType, Integer> counts;

        private QuestionDifficulty difficulty = QuestionDifficulty.ADVANCED;

        /** 用户指定的知识点标签，可选；会尽量归一到主分类白名单 */
        private List<String> tags;

        /**
         * 本卷主分类 code（可选）。空则出题时由模型根据已有分类推断，必要时新建。
         */
        private String category;

        @NotNull(message = "请选择出题模型")
        private Long modelProfileId;

        /** zh / en */
        private String language = "zh";

        /**
         * 是否在出题流水线里自动跑「提示词优化」。
         * 默认 true；前端关闭「自动优化」或已手动优化描述后传 false。
         */
        private Boolean autoOptimize = true;
    }

    /** 仅优化出题描述（不创建任务）。 */
    @Data
    public static class OptimizeRequest {
        @NotBlank(message = "请描述想考什么")
        @Size(max = 5000, message = "提示词不超过 5000 字")
        private String prompt;

        private Long articleId;

        private Map<QuestionType, Integer> counts;

        private QuestionDifficulty difficulty = QuestionDifficulty.ADVANCED;

        private List<String> tags;

        /** 可选；空则优化时不强制分类 */
        private String category;

        @NotNull(message = "请选择出题模型")
        private Long modelProfileId;

        private String language = "zh";
    }

    @Data
    public static class OptimizeResult {
        private String optimizedPrompt;
        private Integer promptTokens;
        private Integer completionTokens;
        private Long costMs;

        public static OptimizeResult of(String text, int promptTokens, int completionTokens, long costMs) {
            OptimizeResult r = new OptimizeResult();
            r.optimizedPrompt = text;
            r.promptTokens = promptTokens;
            r.completionTokens = completionTokens;
            r.costMs = costMs;
            return r;
        }
    }

    /** 出题页题型数量预设。 */
    @Data
    public static class CountPresetView {
        private Map<QuestionType, Integer> counts;
        /** false：库里还没有用户保存过，返回内置默认值 */
        private boolean saved;

        public static CountPresetView of(Map<QuestionType, Integer> counts, boolean saved) {
            CountPresetView v = new CountPresetView();
            v.counts = counts;
            v.saved = saved;
            return v;
        }
    }

    @Data
    public static class CountPresetRequest {
        @NotNull(message = "请至少设置一种题型")
        private Map<QuestionType, Integer> counts;
    }

    /** 存入 generation_job.params_json 的参数快照（不含 prompt，prompt 单独一列）。 */
    @Data
    public static class GenerateParams {
        private Map<QuestionType, Integer> counts;
        private QuestionDifficulty difficulty;
        private List<String> tags;
        /** 主分类 code，可空 */
        private String category;
        private Long modelProfileId;
        private String language;
        /** null / true = 自动优化；false = 跳过 */
        private Boolean autoOptimize;

        /** 缺省或 true 才跑提示词优化；显式 false 必须跳过。 */
        public boolean shouldAutoOptimize() {
            return autoOptimize == null || Boolean.TRUE.equals(autoOptimize);
        }

        public static GenerateParams from(GenerateRequest req) {
            GenerateParams p = new GenerateParams();
            p.counts = req.getCounts();
            p.difficulty = req.getDifficulty();
            p.tags = req.getTags();
            p.category = req.getCategory() == null || req.getCategory().isBlank()
                    ? null : req.getCategory().trim();
            p.modelProfileId = req.getModelProfileId();
            p.language = req.getLanguage();
            p.autoOptimize = req.getAutoOptimize() == null || Boolean.TRUE.equals(req.getAutoOptimize());
            return p;
        }
    }

    /** 任务视图。 */
    @Data
    public static class GenerationView {
        private Long id;
        /** 用户原文 */
        private String prompt;
        /** 优化后用于出题的指令；优化完成前可能为空 */
        private String optimizedPrompt;
        /** 主分类 code */
        private String category;
        /** 主分类展示名 */
        private String categoryLabel;
        /** 来源文章 */
        private Long articleId;
        private Long modelProfileId;
        private String modelSnapshot;
        private String status;
        private Integer requestedCount;
        private Integer generatedCount;
        private Integer promptTokens;
        private Integer completionTokens;
        private Long costMs;
        private String errorMsg;
        /** 失败批次的原始输出（详情接口带，列表不带），绝不静默丢题 */
        private String rawOutput;
        /** 出题参数快照（历史页「再来一次」/详情展示用） */
        private GenerateParams params;
        private LocalDateTime createdAt;
    }

    /** 单批结果视图（预览页失败重试用）。 */
    @Data
    public static class BatchResultView {
        private QuestionType type;
        private String status;
        private Integer requestedCount;
        private Integer generatedCount;
        private String errorMsg;
        private String rawOutput;
    }

    /** 单题视图（预览页展示用）。 */
    @Data
    public static class QuestionView {
        private Long id;
        private QuestionType type;
        private QuestionDifficulty difficulty;
        private String stem;
        private List<QuestionBatchDTO.Option> options;
        private String correctAnswer;
        private List<String> acceptedAnswers;
        private String referenceAnswer;
        private List<QuestionBatchDTO.RubricPoint> rubric;
        private Integer fullScore;
        private String explanation;
        private List<String> tags;
        private boolean editedByUser;
        private String status;
    }

    /** 单题重生成请求。 */
    @Data
    public static class RegenerateRequest {
        @Size(max = 1000, message = "修改意见不超过 1000 字")
        private String feedback;
    }

    /** 确认组卷结果。 */
    @Data
    public static class ConfirmResult {
        private Long examId;

        public static ConfirmResult of(Long examId) {
            ConfirmResult r = new ConfirmResult();
            r.examId = examId;
            return r;
        }
    }
}
