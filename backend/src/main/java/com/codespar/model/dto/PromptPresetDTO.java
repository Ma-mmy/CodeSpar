package com.codespar.model.dto;

import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** 提示词预设 DTO。 */
public class PromptPresetDTO {

    /** 可保存的出题参数快照（不含模型）。 */
    @Data
    public static class Params {
        private Map<QuestionType, Integer> counts;
        private QuestionDifficulty difficulty;
        private List<String> tags;
        /** 主分类 code */
        private String category;
        private String language;
    }

    @Data
    public static class View {
        private Long id;
        private String name;
        private String prompt;
        private Params params;
        private Boolean builtin;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    @Data
    public static class Upsert {
        @NotBlank(message = "请填写预设名称")
        @Size(max = 80, message = "名称不超过 80 字")
        private String name;

        @NotBlank(message = "请填写提示词")
        @Size(max = 10000, message = "提示词不超过 10000 字")
        private String prompt;

        private Params params;
    }

    @Data
    public static class Rename {
        @NotBlank(message = "请填写预设名称")
        @Size(max = 80, message = "名称不超过 80 字")
        private String name;
    }
}
