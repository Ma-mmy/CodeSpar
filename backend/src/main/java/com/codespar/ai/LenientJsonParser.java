package com.codespar.ai;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 宽松 JSON 解析器 —— 出题质量的生命线（PRD 要求解析成功率 &gt; 95%）。四道防线：
 *
 * <ol>
 *   <li>直接 {@code readValue}</li>
 *   <li>剥掉 {@code ```json ... ```} 围栏再解析</li>
 *   <li>提取首个 {@code {} } 到末个 {@code }} }（或 {@code [ ]}）的子串再解析</li>
 *   <li>放宽解析器（尾随逗号 / 未转义换行 / 缺失值）+ 中文全角引号修复</li>
 * </ol>
 *
 * <p>全程失败抛 {@link IllegalStateException}，错误信息用于回灌给模型要求修正（重试）。
 */
@Slf4j
@Component
public class LenientJsonParser {

    /** 严格模式：未知字段忽略、未知枚举按 null（交给业务校验拦截）。 */
    private final ObjectMapper strict;
    /** 宽松模式：额外放行尾随逗号、字符串内未转义换行、缺失值。 */
    private final ObjectMapper lenient;

    public LenientJsonParser() {
        this.strict = baseMapper();

        JsonFactory factory = JsonFactory.builder()
                .enable(JsonReadFeature.ALLOW_TRAILING_COMMA)
                .enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS)
                .enable(JsonReadFeature.ALLOW_MISSING_VALUES)
                .build();
        this.lenient = baseMapper().copyWith(factory);
    }

    private static ObjectMapper baseMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        mapper.configure(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL, true);
        return mapper;
    }

    /** 解析为目标类型；失败抛 IllegalStateException（信息可用于回灌重试）。 */
    public <T> T parse(String raw, Class<T> type) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalStateException("模型返回为空");
        }

        // 防线一：直接解析
        try {
            return strict.readValue(raw, type);
        } catch (Exception ignored) {
            // 继续
        }

        String candidate = stripFences(raw);

        // 防线二：剥围栏后解析
        if (candidate != null) {
            try {
                return lenient.readValue(candidate, type);
            } catch (Exception ignored) {
                // 继续
            }
        }

        // 防线三：提取首个 {/[ 到末个 }/] 的子串
        String extracted = extractJson(candidate != null ? candidate : raw);
        if (extracted != null) {
            try {
                return lenient.readValue(extracted, type);
            } catch (Exception ignored) {
                // 继续
            }
        }

        // 防线四：修复全角引号（未转义换行/尾随逗号已由 lenient 放行）
        String repaired = repairQuotes(extracted != null ? extracted : candidate != null ? candidate : raw);
        try {
            return lenient.readValue(repaired, type);
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.toString() : e.getMessage();
            String snippet = raw.length() > 400 ? raw.substring(0, 400) + "…" : raw;
            throw new IllegalStateException("JSON 解析失败：" + msg + "\n原始输出：\n" + snippet);
        }
    }

    /** 剥掉 ```json ``` 围栏；无围栏返回 null。 */
    private static String stripFences(String raw) {
        String s = raw.trim();
        if (!s.startsWith("```")) {
            return null;
        }
        int first = s.indexOf('\n');
        int last = s.lastIndexOf("```");
        if (first < 0 || last <= first) {
            return null;
        }
        return s.substring(first + 1, last).trim();
    }

    /**
     * 提取首个 {@code {} } 到末个 {@code }} }（或首个 {@code [} 到末个 {@code ]}）。
     * 模型常在前面输出一句"好的，以下是题目："，这步专门对付这种情况。
     */
    private static String extractJson(String s) {
        if (s == null) {
            return null;
        }
        int objStart = s.indexOf('{');
        int arrStart = s.indexOf('[');
        if (objStart < 0 && arrStart < 0) {
            return null;
        }
        if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
            int end = s.lastIndexOf('}');
            return end > objStart ? s.substring(objStart, end + 1) : null;
        }
        int end = s.lastIndexOf(']');
        return end > arrStart ? s.substring(arrStart, end + 1) : null;
    }

    /** 中文全角引号换成半角，处理模型输出「“xxx”」这种不规范的 JSON。 */
    private static String repairQuotes(String s) {
        return s.replace('“', '"').replace('”', '"').replace('‘', '\'').replace('’', '\'');
    }
}
