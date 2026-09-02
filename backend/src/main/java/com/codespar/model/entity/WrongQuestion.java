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
 * 错题本条目。阅卷完成后得分率低于阈值自动入库（完整错题本 UI 留到 Step 2）。
 * <p>status: ACTIVE / MASTERED
 */
@Data
@TableName("wrong_question")
public class WrongQuestion {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long questionId;
    private Integer wrongCount;
    private Integer passStreak;
    private BigDecimal lastScoreRate;
    private LocalDateTime lastWrongAt;
    private String status;
    private Boolean manualAdded;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
