package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 题目↔标签（N:N）。复合主键，不走 BaseMapper，
 * 增删由 {@code QuestionTagMapper} 的自定义 SQL 完成。
 */
@Data
@TableName("question_tag")
public class QuestionTag {

    private Long questionId;

    private Long tagId;
}
