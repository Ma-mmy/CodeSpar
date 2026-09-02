package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 题目。独立于试卷存在 —— 这是题库沉淀与错题重刷的基础。
 * <p>status: DRAFT（生成后未确认）/ ACTIVE（已入卷）/ ARCHIVED
 */
@Data
@TableName("question")
public class Question {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 来源出题任务；手工录入可为空 */
    private Long jobId;

    private QuestionType type;

    private QuestionDifficulty difficulty;

    /** 题干（Markdown） */
    private String stem;

    /** 题干归一化后的 SimHash，用于去重（Step 2 启用） */
    private String stemHash;

    /** 选择题选项 [{key,text}]，JSON 字符串 */
    private String optionsJson;

    /** 客观题正确答案；填空题标准答案 */
    private String correctAnswer;

    /** 填空题可接受的同义表述列表，JSON 字符串 */
    private String acceptedAnswers;

    /** 参考答案（Markdown），也是复盘学习材料 */
    private String referenceAnswer;

    /** 评分要点 [{point,score}]，JSON 字符串，主观题必填 */
    private String rubricJson;

    private Integer fullScore;

    /** 客观题答案解析 */
    private String explanation;

    private String status;

    private Boolean editedByUser;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
