package com.codespar.ai;

import com.codespar.model.entity.ModelProfile;
import com.codespar.model.enums.ProviderType;
import org.springframework.ai.chat.model.ChatModel;

/**
 * 按配置在运行时构造 ChatModel。
 *
 * <p>之所以不用 Spring AI 的自动配置：模型配置存在数据库里、由用户在 UI 上随时增删，
 * 启动时静态装配的 Bean 根本不适用。
 *
 * <p>新增一家走私有协议的厂商时，加一个本接口的实现即可，
 * 上层（出题、阅卷）完全无感。
 */
public interface ChatModelProvider {

    ProviderType type();

    /**
     * @param profile     模型配置
     * @param apiKeyPlain 已解密的 apiKey 明文（调用方负责解密，本方法不接触密文）
     */
    ChatModel build(ModelProfile profile, String apiKeyPlain);
}
