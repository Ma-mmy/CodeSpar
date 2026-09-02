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
 * 试卷（一次模考的载体）。
 * <p>status: NOT_STARTED / IN_PROGRESS / SUBMITTED / GRADED
 * <p>source: GENERATED / MANUAL / WRONG_BOOK / RETAKE
 */
@Data
@TableName("exam")
public class Exam {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;

    /** 主分类（粗粒度，ExamCategory.code），用于列表筛选 */
    private String category;

    private String source;

    /** 来源出题任务（人工组卷时为空） */
    private Long jobId;

    /** 重刷时指向原卷，用于对比两次得分 */
    private Long originExamId;

    /** 来源文章（文章开卷）；可空 */
    private Long articleId;

    private String status;

    /** 空 = 不限时 */
    private Integer timeLimitMin;

    private Integer questionCount;
    private Integer fullScore;

    private BigDecimal totalScore;
    private BigDecimal scoreRate;

    private Long gradingModelProfileId;

    private LocalDateTime startedAt;
    private LocalDateTime submittedAt;

    private Integer durationSec;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
