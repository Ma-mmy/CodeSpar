package com.codespar.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

public class CategoryDTO {

    @Data
    public static class View {
        private Long id;
        private String code;
        private String label;
        private boolean builtin;
        private boolean enabled;
        private Integer sortOrder;
        private LocalDateTime updatedAt;
    }

    @Data
    public static class Upsert {
        /** 新建时可空：空则按名称自动生成 */
        @Size(max = 64, message = "分类编码不超过 64 字")
        private String code;

        @NotBlank(message = "请填写分类名称")
        @Size(max = 80, message = "分类名称不超过 80 字")
        private String label;

        private Boolean enabled;

        private Integer sortOrder;
    }
}
