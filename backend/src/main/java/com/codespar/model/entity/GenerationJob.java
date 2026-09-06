package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 出题任务（出题历史的载体）。
 * <p>status: RUNNING / SUCCESS / PARTIAL / FAILED / CANCELLED
 */
@Data
@TableName("generation_job")
public class GenerationJob {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 用户写的出题提示词（原文） */
    private String prompt;

    /** 经平台提示词工程优化后的出题指令；实际出题用这个 */
    private String optimizedPrompt;

    /** 主分类（粗粒度，ExamCategory.code） */
    private String category;

    /** 来源文章；具体上下文模式保存在 paramsJson；可空 */
    private Long articleId;

    /** 出题参数快照（题型数量/难度/标签/语言），JSON 字符串 */
    private String paramsJson;

    private Long modelProfileId;

    /** 冗余模型名，配置删了历史仍可读 */
    private String modelSnapshot;

    private String status;

    private Integer requestedCount;
    private Integer generatedCount;
    private Integer promptTokens;
    private Integer completionTokens;
    private Long costMs;

    private String errorMsg;

    /** 解析失败时保留的原始输出（MEDIUMTEXT），绝不静默丢题 */
    private String rawOutput;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
