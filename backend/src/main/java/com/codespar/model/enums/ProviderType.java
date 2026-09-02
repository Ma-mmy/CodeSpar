package com.codespar.model.enums;

/**
 * 模型接入协议。
 *
 * <p>绝大多数厂商走 {@link #OPENAI_COMPATIBLE} —— 代码里没有任何厂商判断，
 * 用户填什么 baseURL 就连什么，DeepSeek / Kimi / 智谱 / OpenRouter / 硅基流动 /
 * 本地 Ollama / 公司内网网关都无需改代码。
 */
public enum ProviderType {

    /** OpenAI 兼容协议：baseURL + apiKey + model 名 */
    OPENAI_COMPATIBLE,

    /** DashScope 原生（通义千问）。通义也可选兼容模式，走 OPENAI_COMPATIBLE 即可。 */
    DASHSCOPE,
}
