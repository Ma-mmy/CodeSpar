package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 文章索引与派生摘要。Markdown 原文以 sourcePath 对应的磁盘文件为准。
 * <p>summaryStatus: NONE / RUNNING / READY / FAILED / STALE
 */
@Data
@TableName("article")
public class Article {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 空 = 挂在根目录 */
    private Long folderId;

    private String title;

    /** ExamCategory.code，可空；开卷/出题时再必填 */
    private String category;

    private String bodyMd;

    /** 正文 SHA-256，用于判断摘要是否过期 */
    private String bodyHash;

    private String sourcePath;

    private String summaryMd;

    /** 结构化摘要 JSON */
    private String summaryJson;

    private String summaryStatus;

    private String summaryError;

    private Long summaryModelId;

    private String summaryModelSnap;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
