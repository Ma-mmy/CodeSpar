package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 作答。唯一键 (exam_id, question_id)。
 * <p>content 约定：单选/判断 = 选项 key；多选 = 排序后逗号分隔如 "A,C"；
 * 填空 = JSON 数组字符串；主观题 = Markdown 文本。
 */
@Data
@TableName("answer")
public class Answer {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long examId;

    private Long questionId;

    private String content;

    /** 标记待定 */
    private Boolean flagged;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
