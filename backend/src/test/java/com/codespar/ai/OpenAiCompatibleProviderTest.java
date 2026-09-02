package com.codespar.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * baseUrl 与 completionsPath 拼接规则是 P2 最容易踩的坑。
 * 用户从厂商文档复制的 baseURL 通常已带 /v1，默认 path 再拼 /v1 就会 404。
 */
class OpenAiCompatibleProviderTest {

    @Test
    void pathAlreadyHasVersionSegment() {
        assertEquals("/chat/completions",
                OpenAiCompatibleProvider.resolveCompletionsPath("https://api.deepseek.com/v1"));
        assertEquals("/chat/completions",
                OpenAiCompatibleProvider.resolveCompletionsPath("https://dashscope.aliyuncs.com/compatible-mode/v1"));
        assertEquals("/chat/completions",
                OpenAiCompatibleProvider.resolveCompletionsPath("http://localhost:11434/v1"));
        assertEquals("/chat/completions",
                OpenAiCompatibleProvider.resolveCompletionsPath("https://openrouter.ai/api/v1"));
    }

    @Test
    void pathIsDomainOnly() {
        assertEquals("/v1/chat/completions",
                OpenAiCompatibleProvider.resolveCompletionsPath("https://api.deepseek.com"));
        assertEquals("/v1/chat/completions",
                OpenAiCompatibleProvider.resolveCompletionsPath("https://api.openai.com/"));
    }
}
