package com.codespar.service;

import com.codespar.ai.ChatModelFactory;
import com.codespar.model.dto.ModelProfileDTO;
import com.codespar.model.entity.ModelProfile;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.stereotype.Component;

/**
 * 连通性测试：发一条极短请求，验证 baseURL / apiKey / 模型名三者是否都对。
 *
 * <p>这一步看着不起眼，但能省掉大量排查时间 —— 否则要等到出题跑了半分钟
 * 才发现是 model 名拼错了。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ModelConnectivityTester {

    /** 只要模型回一个字就够，别浪费 token */
    private static final String PING = "回复两个字：正常";

    private final ChatModelFactory factory;

    public ModelProfileDTO.TestResult test(ModelProfile profile, String apiKeyPlain) {
        long start = System.nanoTime();
        try {
            ChatModel model = factory.buildTransient(profile, apiKeyPlain);
            ChatResponse response = model.call(new Prompt(PING));
            long ms = elapsedMs(start);

            String reply = extractText(response);
            Integer promptTokens = null;
            Integer completionTokens = null;
            if (response.getMetadata() != null && response.getMetadata().getUsage() != null) {
                Usage usage = response.getMetadata().getUsage();
                promptTokens = usage.getPromptTokens();
                completionTokens = usage.getCompletionTokens();
            }

            return ModelProfileDTO.TestResult.ok(ms, truncate(reply), promptTokens, completionTokens);

        } catch (Exception e) {
            long ms = elapsedMs(start);
            // 关键：把厂商返回的原始错误透传给前端。
            // 401 / 404 / model not found 这类信息不给原文，用户根本没法排查。
            log.warn("模型连通测试失败 model={} baseUrl={}: {}",
                    profile.getModelName(), profile.getBaseUrl(), e.toString());
            return ModelProfileDTO.TestResult.fail(ms, rootCauseMessage(e));
        }
    }

    private static String extractText(ChatResponse response) {
        if (response == null || response.getResult() == null
                || response.getResult().getOutput() == null) {
            return "(无内容)";
        }
        String text = response.getResult().getOutput().getText();
        return text == null || text.isBlank() ? "(空回复)" : text.trim();
    }

    /** 逐层拆到根因 —— HTTP 错误详情通常在最里层。 */
    private static String rootCauseMessage(Throwable e) {
        Throwable cur = e;
        StringBuilder sb = new StringBuilder(cur.getClass().getSimpleName());
        if (cur.getMessage() != null) sb.append(": ").append(cur.getMessage());

        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
            if (cur.getMessage() != null && !sb.toString().contains(cur.getMessage())) {
                sb.append(" ← ").append(cur.getMessage());
            }
        }
        String msg = sb.toString();
        return msg.length() > 1500 ? msg.substring(0, 1500) + "…" : msg;
    }

    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() > 200 ? s.substring(0, 200) + "…" : s;
    }

    private static long elapsedMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }
}
