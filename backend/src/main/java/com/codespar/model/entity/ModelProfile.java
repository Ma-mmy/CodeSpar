package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.codespar.model.enums.ProviderType;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 模型接入配置。
 *
 * <p>注意 {@link #updatedAt}：ChatModelFactory 用 {@code id + updatedAt} 作为实例缓存的 key，
 * 改了配置这个字段就变，缓存自然失效，不需要手动清理。
 */
@Data
@TableName("model_profile")
public class ModelProfile {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 显示名称，如 DeepSeek-V3 */
    private String name;

    private ProviderType providerType;

    /** OPENAI_COMPATIBLE 必填；DASHSCOPE 原生可为空 */
    private String baseUrl;

    /** AES-256-GCM 密文，绝不存明文 */
    private String apiKeyCipher;

    /** 如 deepseek-chat / qwen-max */
    private String modelName;

    private Boolean canGenerate;
    private Boolean canGrade;
    private Boolean isDefaultGenerate;
    private Boolean isDefaultGrade;

    private BigDecimal temperature;
    private Integer maxTokens;

    /** 是否下发 response_format；很多兼容端点支持不全，默认关 */
    private Boolean supportsJsonMode;

    private Boolean enabled;
    private String remark;

    /** 时间戳由 MybatisMetaObjectHandler 自动填充（SQLite 无 ON UPDATE CURRENT_TIMESTAMP） */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
