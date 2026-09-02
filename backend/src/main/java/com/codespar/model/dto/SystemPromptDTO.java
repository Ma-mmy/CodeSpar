package com.codespar.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;

public class SystemPromptDTO {

    @Data
    public static class PromptMeta {
        private String key;
        private String label;
        private String description;
        private List<SlotMeta> slots;
        /** 当前生效的槽位值（覆盖优先，否则默认） */
        private Map<String, String> values;
        /** 哪些槽位被用户改过 */
        private Map<String, Boolean> overridden;
    }

    @Data
    public static class SlotMeta {
        private String key;
        private String label;
        private String description;
        private String defaultValue;
    }

    @Data
    public static class SaveRequest {
        @NotBlank
        private String promptKey;
        @NotNull
        private Map<String, String> slots;
    }

    @Data
    public static class ResetRequest {
        @NotBlank
        private String promptKey;
        /** 空 = 整条恢复默认 */
        private String slotKey;
    }
}
