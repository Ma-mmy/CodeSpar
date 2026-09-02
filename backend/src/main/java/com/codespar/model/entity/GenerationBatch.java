package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.codespar.model.enums.QuestionType;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 出题批次：每个题型一条，支撑逐批进度展示与单批失败重试。
 * <p>status: PENDING / RUNNING / SUCCESS / FAILED / CANCELLED
 */
@Data
@TableName("generation_batch")
public class GenerationBatch {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long jobId;

    private QuestionType batchType;

    private String status;

    private Integer requestedCount;
    private Integer generatedCount;

    private String errorMsg;

    /** 本批解析失败时保留的原始输出，绝不静默丢题 */
    private String rawOutput;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
