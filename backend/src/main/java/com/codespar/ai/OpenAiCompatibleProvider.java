package com.codespar.ai;

import com.codespar.model.entity.ModelProfile;
import com.codespar.model.enums.ProviderType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.openai.api.ResponseFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;

/**
 * OpenAI 兼容协议的接入实现。
 *
 * <p>覆盖 DeepSeek / Kimi / 智谱 / OpenRouter / 硅基流动 / 本地 Ollama / 公司内网网关……
 * <b>代码里没有任何厂商判断</b>，用户填什么 baseURL 就连什么。
 */
@Slf4j
@Component
public class OpenAiCompatibleProvider implements ChatModelProvider {

    private static final String CHAT_PATH = "/chat/completions";
    private static final String VERSIONED_CHAT_PATH = "/v1" + CHAT_PATH;

    private final Duration connectTimeout;
    private final Duration readTimeout;

    public OpenAiCompatibleProvider(
            @Value("${codespar.http.connect-timeout-sec:15}") long connectTimeoutSec,
            @Value("${codespar.http.read-timeout-sec:180}") long readTimeoutSec) {
        this.connectTimeout = Duration.ofSeconds(connectTimeoutSec);
        this.readTimeout = Duration.ofSeconds(readTimeoutSec);
    }

    @Override
    public ProviderType type() {
        return ProviderType.OPENAI_COMPATIBLE;
    }

    @Override
    public ChatModel build(ModelProfile profile, String apiKeyPlain) {
        String baseUrl = profile.getBaseUrl();
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalArgumentException("OpenAI 兼容协议必须填写 baseURL");
        }

        // 部分兼容网关在 Accept 协商异常时会回 text/event-stream，
        // 导致非流式 chatCompletionEntity 解析失败。强制只要 JSON。
        OpenAiApi api = OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKeyPlain == null ? "" : apiKeyPlain)
                .completionsPath(resolveCompletionsPath(baseUrl))
                .restClientBuilder(RestClient.builder()
                        .requestFactory(requestFactory())
                        .defaultHeader("Accept", "application/json"))
                .build();

        OpenAiChatOptions.Builder options = OpenAiChatOptions.builder()
                .model(profile.getModelName());

        if (profile.getTemperature() != null) {
            options.temperature(profile.getTemperature().doubleValue());
        }
        if (profile.getMaxTokens() != null) {
            options.maxTokens(profile.getMaxTokens());
        }
        // 很多兼容端点对 response_format 支持不全，只有显式开启才下发
        if (Boolean.TRUE.equals(profile.getSupportsJsonMode())) {
            options.responseFormat(ResponseFormat.builder()
                    .type(ResponseFormat.Type.JSON_OBJECT)
                    .build());
        }

        return OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(options.build())
                .build();
    }

    /**
     * 决定 completionsPath —— <b>这是最容易踩的坑</b>。
     *
     * <p>Spring AI 把 {@code baseUrl} 与 {@code completionsPath} 直接拼接，而
     * completionsPath 默认是 {@code /v1/chat/completions}。用户从厂商文档复制的
     * baseURL 通常已经带了版本段（{@code https://api.deepseek.com/v1}），
     * 照默认值拼出来就是 {@code /v1/v1/chat/completions} —— 稳定 404。
     *
     * <p>规则：baseURL 里已含路径段（说明用户填到了版本号）就用 {@code /chat/completions}，
     * 只填到域名则用 {@code /v1/chat/completions}。两种填法都能正常工作。
     *
     * <pre>
     * https://api.deepseek.com/v1                      → /chat/completions
     * https://api.deepseek.com                         → /v1/chat/completions
     * https://dashscope.aliyuncs.com/compatible-mode/v1→ /chat/completions
     * https://openrouter.ai/api/v1                     → /chat/completions
     * http://localhost:11434/v1                        → /chat/completions
     * </pre>
     */
    static String resolveCompletionsPath(String baseUrl) {
        try {
            URI uri = new URI(baseUrl.trim());
            String path = uri.getPath();
            boolean hasPathSegment = path != null && !path.isBlank() && !path.equals("/");
            return hasPathSegment ? CHAT_PATH : VERSIONED_CHAT_PATH;
        } catch (URISyntaxException e) {
            log.warn("baseURL 无法解析为 URI，按默认路径处理：{}", baseUrl);
            return VERSIONED_CHAT_PATH;
        }
    }

    private ClientHttpRequestFactory requestFactory() {
        // LLM 出题一批可能跑一两分钟，读超时必须给够
        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.defaults()
                .withConnectTimeout(connectTimeout)
                .withReadTimeout(readTimeout);
        return ClientHttpRequestFactoryBuilder.detect().build(settings);
    }
}
