package com.codespar.model.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 出题提示词预设。
 * <p>params_json 存题型数量/难度/标签/语言/去重等快照（不含模型，模型随用户当前配置选）。
 * builtin=true 为内置起步预设，不可删除、不可改名。
 */
@Data
@TableName("prompt_preset")
public class PromptPreset {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;
    private String prompt;
    private String paramsJson;
    private Boolean builtin;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
