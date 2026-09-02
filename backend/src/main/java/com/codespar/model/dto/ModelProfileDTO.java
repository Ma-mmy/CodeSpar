package com.codespar.model.dto;

import com.codespar.model.enums.ProviderType;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class ModelProfileDTO {

    /**
     * 返回给前端的视图。
     * <p><b>只有掩码，永远不含明文 apiKey。</b>
     */
    @Data
    public static class View {
        private Long id;
        private String name;
        private ProviderType providerType;
        private String baseUrl;
        /** 如 sk-a…z9，仅供识别 */
        private String apiKeyMask;
        private String modelName;
        private Boolean canGenerate;
        private Boolean canGrade;
        private Boolean isDefaultGenerate;
        private Boolean isDefaultGrade;
        private BigDecimal temperature;
        private Integer maxTokens;
        private Boolean supportsJsonMode;
        private Boolean enabled;
        private String remark;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    /** 新增/编辑入参。 */
    @Data
    public static class Upsert {
        @NotBlank(message = "名称不能为空")
        @Size(max = 64, message = "名称不超过 64 字")
        private String name;

        @NotNull(message = "接入协议不能为空")
        private ProviderType providerType;

        /** OPENAI_COMPATIBLE 必填，由 Service 层按 providerType 校验 */
        @Size(max = 512)
        private String baseUrl;

        /**
         * 明文 apiKey。
         * <p>编辑时若为 null 或空表示"不修改"，沿用库里已有的密文 ——
         * 因为前端拿到的只有掩码，不可能回填明文。
         */
        private String apiKey;

        @NotBlank(message = "模型名不能为空")
        @Size(max = 128)
        private String modelName;

        private Boolean canGenerate = true;
        private Boolean canGrade = true;

        @DecimalMin(value = "0.0", message = "temperature 不能小于 0")
        @DecimalMax(value = "2.0", message = "temperature 不能大于 2")
        private BigDecimal temperature;

        @Min(value = 1, message = "maxTokens 至少为 1")
        @Max(value = 262144, message = "maxTokens 过大")
        private Integer maxTokens;

        private Boolean supportsJsonMode = false;
        private Boolean enabled = true;

        @Size(max = 512)
        private String remark;
    }

    /** 连通性测试结果。 */
    @Data
    public static class TestResult {
        private boolean success;
        /** 往返耗时（毫秒） */
        private long latencyMs;
        /** 模型回复片段，成功时有 */
        private String reply;
        private Integer promptTokens;
        private Integer completionTokens;
        /**
         * 失败时的<b>原始</b>错误信息。
         * 401 / 404 / model not found 这类必须原文透传，否则排查配置极其痛苦。
         */
        private String error;

        public static TestResult ok(long latencyMs, String reply, Integer pt, Integer ct) {
            TestResult r = new TestResult();
            r.success = true;
            r.latencyMs = latencyMs;
            r.reply = reply;
            r.promptTokens = pt;
            r.completionTokens = ct;
            return r;
        }

        public static TestResult fail(long latencyMs, String error) {
            TestResult r = new TestResult();
            r.success = false;
            r.latencyMs = latencyMs;
            r.error = error;
            return r;
        }
    }

    /**
     * 未保存就先测试的入参（新增表单上点「测试连接」）。
     * 与 Upsert 的区别：apiKey 必填，因为没有库里的密文可沿用。
     */
    @Data
    public static class TestRequest {
        @NotNull
        private ProviderType providerType;
        private String baseUrl;
        @NotBlank(message = "测试连接需要填写 apiKey")
        private String apiKey;
        @NotBlank(message = "模型名不能为空")
        private String modelName;
    }
}
