package com.codespar.ai;

import com.codespar.config.CryptoService;
import com.codespar.model.entity.ModelProfile;
import com.codespar.model.enums.ProviderType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ChatModel 实例的工厂与缓存。
 *
 * <p>缓存 key 是 {@code (profileId, updatedAt)} —— 用户改了配置，{@code updatedAt} 就变，
 * 旧实例自然失效，不需要任何手动清理逻辑。
 */
@Slf4j
@Component
public class ChatModelFactory {

    private record CacheKey(Long profileId, LocalDateTime updatedAt) {}

    private final Map<ProviderType, ChatModelProvider> providers = new EnumMap<>(ProviderType.class);
    private final Map<CacheKey, ChatModel> cache = new ConcurrentHashMap<>();
    private final CryptoService crypto;

    public ChatModelFactory(List<ChatModelProvider> providerBeans, CryptoService crypto) {
        this.crypto = crypto;
        for (ChatModelProvider p : providerBeans) {
            providers.put(p.type(), p);
        }
        log.info("已注册模型接入协议：{}", providers.keySet());
    }

    /** 取（或构造）一个 ChatModel。apiKey 在此解密，不外泄。 */
    public ChatModel get(ModelProfile profile) {
        Objects.requireNonNull(profile, "profile 不能为空");
        CacheKey key = new CacheKey(profile.getId(), profile.getUpdatedAt());
        return cache.computeIfAbsent(key, k -> build(profile));
    }

    /**
     * 用一份「尚未落库」的配置构造实例，供新增表单上的「测试连接」使用。
     * 不进缓存。
     */
    public ChatModel buildTransient(ModelProfile profile, String apiKeyPlain) {
        return resolveProvider(profile.getProviderType()).build(profile, apiKeyPlain);
    }

    private ChatModel build(ModelProfile profile) {
        String apiKey = crypto.decrypt(profile.getApiKeyCipher());
        return resolveProvider(profile.getProviderType()).build(profile, apiKey);
    }

    private ChatModelProvider resolveProvider(ProviderType type) {
        ChatModelProvider provider = providers.get(type);
        if (provider == null) {
            throw new IllegalArgumentException("不支持的接入协议：" + type);
        }
        return provider;
    }

    /** 配置被删除时顺手清缓存（不清也不会错，只是白占内存）。 */
    public void evict(Long profileId) {
        cache.keySet().removeIf(k -> Objects.equals(k.profileId(), profileId));
    }

    public int cachedCount() {
        return cache.size();
    }
}
