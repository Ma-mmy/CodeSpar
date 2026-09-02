package com.codespar.service;

import com.codespar.model.enums.QuestionType;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 客观题本地判分（零 token）。
 * <p>选择/判断：比对正确选项；填空：归一化后比对标准答案与同义表述。
 */
@Component
public class LocalScorer {

    public record ObjectiveResult(BigDecimal score, boolean matched, String comment) {}

    /** 选择 / 判断本地判分。 */
    public ObjectiveResult scoreChoice(QuestionType type, String correctAnswer, String userAnswer, int fullScore) {
        if (userAnswer == null || userAnswer.isBlank()) {
            return new ObjectiveResult(BigDecimal.ZERO, false, "未作答");
        }
        if (correctAnswer == null || correctAnswer.isBlank()) {
            return new ObjectiveResult(BigDecimal.ZERO, false, "题目缺少标准答案，无法本地判分");
        }
        boolean ok = switch (type) {
            case MULTI_CHOICE -> normalizeKeys(userAnswer).equals(normalizeKeys(correctAnswer));
            case SINGLE_CHOICE, TRUE_FALSE -> normalizeKey(userAnswer).equals(normalizeKey(correctAnswer));
            default -> false;
        };
        if (ok) {
            return new ObjectiveResult(BigDecimal.valueOf(fullScore), true, "答案正确");
        }
        return new ObjectiveResult(BigDecimal.ZERO, false,
                "答案不正确（正确：" + correctAnswer.trim() + "，作答：" + userAnswer.trim() + "）");
    }

    /**
     * 填空题本地匹配。命中返回满分；未命中返回 matched=false，由上层决定是否调模型判语义等价。
     * <p>前端多空作答存为 JSON 数组字符串（如 {@code ["rerank"]}），这里先解开再比。
     */
    public ObjectiveResult scoreFillBlank(List<String> accepted, String userAnswer, int fullScore) {
        if (userAnswer == null || userAnswer.isBlank()) {
            return new ObjectiveResult(BigDecimal.ZERO, false, "未作答");
        }
        if (accepted == null || accepted.isEmpty()) {
            return new ObjectiveResult(BigDecimal.ZERO, false, "题目缺少标准答案");
        }
        String[] userParts = splitBlanks(userAnswer);
        // 单空：整段或数组唯一元素与任一可接受答案比对
        if (userParts.length == 1) {
            String normalizedUser = normalizeText(userParts[0]);
            for (String a : accepted) {
                if (a != null && normalizeText(a).equals(normalizedUser)) {
                    return new ObjectiveResult(BigDecimal.valueOf(fullScore), true, "与标准答案匹配");
                }
            }
            return new ObjectiveResult(BigDecimal.ZERO, false, "本地未匹配，需语义判定");
        }
        // 多空：与 accepted 按序比对（accepted 长度需一致；否则退化为整段匹配）
        if (accepted.size() == userParts.length) {
            boolean all = true;
            for (int i = 0; i < userParts.length; i++) {
                if (!normalizeText(userParts[i]).equals(normalizeText(accepted.get(i)))) {
                    all = false;
                    break;
                }
            }
            if (all) {
                return new ObjectiveResult(BigDecimal.valueOf(fullScore), true, "各空与标准答案匹配");
            }
        }
        // 整段字符串兜底（兼容旧数据）
        String normalizedUser = normalizeText(userAnswer);
        for (String a : accepted) {
            if (a != null && normalizeText(a).equals(normalizedUser)) {
                return new ObjectiveResult(BigDecimal.valueOf(fullScore), true, "与标准答案匹配");
            }
        }
        return new ObjectiveResult(BigDecimal.ZERO, false, "本地未匹配，需语义判定");
    }

    public static BigDecimal rate(BigDecimal earned, int full) {
        if (full <= 0) {
            return BigDecimal.ZERO;
        }
        return earned.divide(BigDecimal.valueOf(full), 4, RoundingMode.HALF_UP);
    }

    /** 去空格、转小写、全角→半角、Unicode 正规化。 */
    public static String normalizeText(String s) {
        if (s == null) {
            return "";
        }
        String n = Normalizer.normalize(s, Normalizer.Form.NFKC);
        StringBuilder sb = new StringBuilder(n.length());
        for (int i = 0; i < n.length(); i++) {
            char c = n.charAt(i);
            if (c >= 0xFF01 && c <= 0xFF5E) {
                c = (char) (c - 0xFEE0);
            } else if (c == 0x3000) {
                c = ' ';
            }
            if (!Character.isWhitespace(c)) {
                sb.append(Character.toLowerCase(c));
            }
        }
        return sb.toString();
    }

    private static String normalizeKey(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }

    private static Set<String> normalizeKeys(String s) {
        return Arrays.stream(s.split("[,，\\s]+"))
                .map(String::trim)
                .filter(x -> !x.isEmpty())
                .map(x -> x.toUpperCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static String[] splitBlanks(String s) {
        String trimmed = s == null ? "" : s.trim();
        // 前端 FILL_BLANK 存 JSON 数组：["a","b"]
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                // 轻量解析，避免引入额外依赖路径；失败则走下面分隔逻辑
                String inner = trimmed.substring(1, trimmed.length() - 1).trim();
                if (inner.isEmpty()) {
                    return new String[] {""};
                }
                List<String> parts = new java.util.ArrayList<>();
                StringBuilder cur = new StringBuilder();
                boolean inStr = false;
                for (int i = 0; i < inner.length(); i++) {
                    char c = inner.charAt(i);
                    if (c == '"' && (i == 0 || inner.charAt(i - 1) != '\\')) {
                        inStr = !inStr;
                        continue;
                    }
                    if (c == ',' && !inStr) {
                        parts.add(cur.toString().trim());
                        cur.setLength(0);
                        continue;
                    }
                    cur.append(c);
                }
                parts.add(cur.toString().trim());
                return parts.stream().map(LocalScorer::unquote).toArray(String[]::new);
            } catch (Exception ignored) {
                // fall through
            }
        }
        if (trimmed.contains("|")) {
            return Arrays.stream(trimmed.split("\\|")).map(String::trim).toArray(String[]::new);
        }
        if (trimmed.contains("\n")) {
            return Arrays.stream(trimmed.split("\\R")).map(String::trim).filter(x -> !x.isEmpty()).toArray(String[]::new);
        }
        return new String[] {trimmed};
    }

    private static String unquote(String s) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        if (t.length() >= 2 && t.startsWith("\"") && t.endsWith("\"")) {
            return t.substring(1, t.length() - 1).replace("\\\"", "\"");
        }
        return t;
    }
}
