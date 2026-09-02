package com.codespar.model.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * 试卷 / 出题任务的主分类（粗粒度白名单）。
 * <p>列表筛选、卷面归类用这个；模型给题打的细标签会尽量归一到此表。
 */
public enum ExamCategory {
    RAG("RAG", "RAG"),
    AGENT("AGENT", "Agent"),
    MULTI_AGENT("MULTI_AGENT", "Multi-Agent"),
    LLM_BASICS("LLM_BASICS", "LLM基础"),
    PROMPT("PROMPT", "Prompt工程"),
    EVAL("EVAL", "Eval"),
    CONTEXT("CONTEXT", "Context工程"),
    INTERVIEW("INTERVIEW", "面试综合");

    private final String code;
    private final String label;

    ExamCategory(String code, String label) {
        this.code = code;
        this.label = label;
    }

    @JsonValue
    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    /** 同义词 / 常见写法 → 白名单分类 */
    private static final Map<String, ExamCategory> ALIASES = new LinkedHashMap<>();

    static {
        alias(RAG, "RAG", "检索增强", "检索增强生成", "Retrieval", "向量检索", "rerank", "chunk");
        alias(AGENT, "Agent", "智能体", "Function Calling", "Tool Calling", "工具调用", "Agents");
        alias(MULTI_AGENT, "Multi-Agent", "MultiAgent", "多智能体", "多Agent", "Orchestration", "编排");
        alias(LLM_BASICS, "LLM", "LLM基础", "大模型", "Transformer", "八股", "基础");
        alias(PROMPT, "Prompt", "Prompt工程", "提示词", "Prompt Engineering", "提示工程");
        alias(EVAL, "Eval", "评测", "Evaluation", "评估");
        alias(CONTEXT, "Context", "Context工程", "上下文", "Context Engineering", "长上下文");
        alias(INTERVIEW, "Interview", "面试", "面试综合", "技术面");
    }

    private static void alias(ExamCategory cat, String... names) {
        for (String n : names) {
            ALIASES.put(normalizeKey(n), cat);
        }
        ALIASES.put(normalizeKey(cat.code), cat);
        ALIASES.put(normalizeKey(cat.label), cat);
    }

    public static List<ExamCategory> all() {
        return Arrays.asList(values());
    }

    @JsonCreator
    public static ExamCategory from(String raw) {
        return resolve(raw).orElse(null);
    }

    public static Optional<ExamCategory> resolve(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        String key = normalizeKey(raw);
        ExamCategory hit = ALIASES.get(key);
        if (hit != null) {
            return Optional.of(hit);
        }
        for (ExamCategory c : values()) {
            if (c.code.equalsIgnoreCase(raw.trim()) || c.label.equalsIgnoreCase(raw.trim())) {
                return Optional.of(c);
            }
        }
        return Optional.empty();
    }

    /** 把模型/用户随意写的标签归一到白名单；无法识别则返回 empty。 */
    public static Optional<String> canonicalizeTag(String raw) {
        return resolve(raw).map(ExamCategory::getLabel);
    }

    private static String normalizeKey(String s) {
        return s.trim().toLowerCase(Locale.ROOT)
                .replace(" ", "")
                .replace("-", "")
                .replace("_", "");
    }
}
