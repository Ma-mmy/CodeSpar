package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 阅卷结果（阅卷历史的载体）。
 * <p>status: RUNNING / SUCCESS / PARTIAL / FAILED
 */
@Data
@TableName("grading")
public class Grading {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long examId;

    private Long modelProfileId;

    /** 冗余模型名，配置删了历史仍可读 */
    private String modelSnapshot;

    private String status;

    private BigDecimal totalScore;
    private Integer fullScore;

    private Integer promptTokens;
    private Integer completionTokens;
    private Long costMs;

    private String errorMsg;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
