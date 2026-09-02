package com.codespar.model.enums;

import com.fasterxml.jackson.annotation.JsonCreator;

/**
 * 题型。与 question.type 列一致。
 * <p>模型经常把题型输出成中文（「概念问答」而不是 SHORT_ANSWER），
 * 用 {@link JsonCreator} 宽容映射，未知值返回 null 交给业务校验拦截。
 * <p>批处理出题时每种题型独立一批，便于并发与单批失败重试。
 */
public enum QuestionType {
    SINGLE_CHOICE,
    MULTI_CHOICE,
    TRUE_FALSE,
    FILL_BLANK,
    SHORT_ANSWER,
    SYSTEM_DESIGN;

    @JsonCreator
    public static QuestionType from(String s) {
        if (s == null) {
            return null;
        }
        String v = s.trim().toUpperCase();
        return switch (v) {
            case "SINGLE_CHOICE", "单选", "单选题", "选择" -> SINGLE_CHOICE;
            case "MULTI_CHOICE", "多选", "多选题" -> MULTI_CHOICE;
            case "TRUE_FALSE", "判断", "判断题", "对错" -> TRUE_FALSE;
            case "FILL_BLANK", "填空", "填空题" -> FILL_BLANK;
            case "SHORT_ANSWER", "问答", "问答题", "概念问答", "简答", "简答题" -> SHORT_ANSWER;
            case "SYSTEM_DESIGN", "设计", "设计题", "系统设计", "架构设计" -> SYSTEM_DESIGN;
            default -> null;
        };
    }
}
