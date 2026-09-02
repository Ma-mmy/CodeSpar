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
 * 单题评分。
 * <p>gradedBy: LOCAL / MODEL
 * <p>rubricResultJson: [{point, maxScore, status(HIT|PARTIAL|MISS), score, reason}]
 */
@Data
@TableName("question_grading")
public class QuestionGrading {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long gradingId;
    private Long questionId;

    private BigDecimal score;
    private Integer fullScore;

    private String rubricResultJson;
    private String comment;

    /** LOCAL = 客观题本地判分；MODEL = 模型阅卷 */
    private String gradedBy;

    private Boolean manualOverride;
    private String overrideReason;

    private String errorMsg;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
