package com.codespar.model.enums;

import com.fasterxml.jackson.annotation.JsonCreator;

/**
 * 难度分级。与 question.difficulty 列一致。
 * <p>模型经常把难度输出成中文（「中级」而不是 INTERMEDIATE），
 * 用 {@link JsonCreator} 宽容映射，未知值返回 null 交给业务校验拦截。
 */
public enum QuestionDifficulty {
    BEGINNER,
    INTERMEDIATE,
    ADVANCED,
    EXPERT;

    @JsonCreator
    public static QuestionDifficulty from(String s) {
        if (s == null) {
            return null;
        }
        String v = s.trim().toUpperCase();
        return switch (v) {
            case "BEGINNER", "初级" -> BEGINNER;
            case "INTERMEDIATE", "中级" -> INTERMEDIATE;
            case "ADVANCED", "高级" -> ADVANCED;
            case "EXPERT", "专家", "专家级" -> EXPERT;
            default -> null;
        };
    }
}
