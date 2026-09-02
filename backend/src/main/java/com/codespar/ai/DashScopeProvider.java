package com.codespar.ai;

import com.alibaba.cloud.ai.dashscope.api.DashScopeApi;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatModel;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.codespar.model.entity.ModelProfile;
import com.codespar.model.enums.ProviderType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Component;

/**
 * 通义千问 DashScope 原生接入（Spring AI Alibaba）。
 *
 * <p>多数情况下走 {@link OpenAiCompatibleProvider} + 兼容模式端点更省事，
 * 一条代码路径覆盖所有厂商。这里保留原生通道，是为了将来用到 DashScope 独有能力
 * （enableThinking、enableSearch、thinkingBudget、workSpaceId 等）。
 */
@Slf4j
@Component
public class DashScopeProvider implements ChatModelProvider {

    @Override
    public ProviderType type() {
        return ProviderType.DASHSCOPE;
    }

    @Override
    public ChatModel build(ModelProfile profile, String apiKeyPlain) {
        DashScopeApi.Builder apiBuilder = DashScopeApi.builder()
                .apiKey(apiKeyPlain == null ? "" : apiKeyPlain);

        // baseURL 留空则用 SDK 默认的 https://dashscope.aliyuncs.com
        if (profile.getBaseUrl() != null && !profile.getBaseUrl().isBlank()) {
            apiBuilder.baseUrl(profile.getBaseUrl().trim());
        }

        // 注意：DashScope 的 builder 方法名是 withXxx，且是 maxToken（单数），与 OpenAI 侧不同
        DashScopeChatOptions.DashScopeChatOptionsBuilder options =
                DashScopeChatOptions.builder().withModel(profile.getModelName());

        if (profile.getTemperature() != null) {
            options.withTemperature(profile.getTemperature().doubleValue());
        }
        if (profile.getMaxTokens() != null) {
            options.withMaxToken(profile.getMaxTokens());
        }

        return DashScopeChatModel.builder()
                .dashScopeApi(apiBuilder.build())
                .defaultOptions(options.build())
                .build();
    }
}
