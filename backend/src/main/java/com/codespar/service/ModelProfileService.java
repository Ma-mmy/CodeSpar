package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.ai.ChatModelFactory;
import com.codespar.config.CryptoService;
import com.codespar.mapper.ModelProfileMapper;
import com.codespar.model.dto.ModelProfileDTO;
import com.codespar.model.entity.ModelProfile;
import com.codespar.model.enums.ProviderType;
import com.codespar.web.ApiExceptionHandler.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ModelProfileService {

    private final ModelProfileMapper mapper;
    private final CryptoService crypto;
    private final ChatModelFactory factory;
    private final ModelConnectivityTester tester;

    /* ---------------------------------------------------------- 查询 */

    public List<ModelProfileDTO.View> list() {
        return mapper.selectList(Wrappers.<ModelProfile>lambdaQuery()
                        .orderByDesc(ModelProfile::getEnabled)
                        .orderByAsc(ModelProfile::getId))
                .stream()
                .map(this::toView)
                .toList();
    }

    public ModelProfile getRequired(Long id) {
        ModelProfile profile = mapper.selectById(id);
        if (profile == null) {
            throw new BizException("模型配置不存在：" + id);
        }
        return profile;
    }

    /** 供出题/阅卷取默认模型。 */
    public ModelProfile getDefaultFor(boolean forGenerate) {
        ModelProfile profile = mapper.selectOne(Wrappers.<ModelProfile>lambdaQuery()
                .eq(forGenerate ? ModelProfile::getIsDefaultGenerate : ModelProfile::getIsDefaultGrade, true)
                .eq(ModelProfile::getEnabled, true)
                .last("LIMIT 1"));
        if (profile == null) {
            throw new BizException(forGenerate
                    ? "还没有设置默认出题模型，请先到「模型管理」配置一个"
                    : "还没有设置默认阅卷模型，请先到「模型管理」配置一个");
        }
        return profile;
    }

    /* ---------------------------------------------------------- 写入 */

    @Transactional
    public ModelProfileDTO.View create(ModelProfileDTO.Upsert req) {
        validate(req, true);
        if (nameExists(req.getName(), null)) {
            throw new BizException("名称已存在：" + req.getName());
        }

        ModelProfile profile = new ModelProfile();
        apply(profile, req);
        profile.setApiKeyCipher(crypto.encrypt(req.getApiKey()));

        // 第一个配置自动设为默认，省得用户还要再点一次
        boolean first = mapper.selectCount(null) == 0;
        profile.setIsDefaultGenerate(first && Boolean.TRUE.equals(req.getCanGenerate()));
        profile.setIsDefaultGrade(first && Boolean.TRUE.equals(req.getCanGrade()));

        mapper.insert(profile);
        // insert 后 re-select，拿到 DB 生成的 created_at / updated_at
        return toView(getRequired(profile.getId()));
    }

    @Transactional
    public ModelProfileDTO.View update(Long id, ModelProfileDTO.Upsert req) {
        ModelProfile profile = getRequired(id);
        validate(req, false);
        if (nameExists(req.getName(), id)) {
            throw new BizException("名称已存在：" + req.getName());
        }

        apply(profile, req);
        // apiKey 留空 = 不修改。前端拿到的只有掩码，不可能回填明文。
        if (req.getApiKey() != null && !req.getApiKey().isBlank()) {
            profile.setApiKeyCipher(crypto.encrypt(req.getApiKey()));
        }

        // 关掉某项能力时，对应的默认标记也要撤掉，否则会取到一个不能用的默认模型
        if (!Boolean.TRUE.equals(profile.getCanGenerate())) profile.setIsDefaultGenerate(false);
        if (!Boolean.TRUE.equals(profile.getCanGrade())) profile.setIsDefaultGrade(false);

        mapper.updateById(profile);
        factory.evict(id);
        return toView(getRequired(id));
    }

    @Transactional
    public void delete(Long id) {
        getRequired(id);
        mapper.deleteById(id);
        factory.evict(id);
    }

    @Transactional
    public void setDefault(Long id, boolean forGenerate) {
        ModelProfile profile = getRequired(id);

        if (forGenerate && !Boolean.TRUE.equals(profile.getCanGenerate())) {
            throw new BizException("该模型未启用「可用于出题」，不能设为默认出题模型");
        }
        if (!forGenerate && !Boolean.TRUE.equals(profile.getCanGrade())) {
            throw new BizException("该模型未启用「可用于阅卷」，不能设为默认阅卷模型");
        }
        if (!Boolean.TRUE.equals(profile.getEnabled())) {
            throw new BizException("该模型已禁用，不能设为默认");
        }

        if (forGenerate) {
            mapper.clearDefaultGenerate();
            profile.setIsDefaultGenerate(true);
        } else {
            mapper.clearDefaultGrade();
            profile.setIsDefaultGrade(true);
        }
        mapper.updateById(profile);
    }

    /* ---------------------------------------------------------- 连通测试 */

    /** 测已保存的配置。 */
    public ModelProfileDTO.TestResult test(Long id) {
        ModelProfile profile = getRequired(id);
        return tester.test(profile, crypto.decrypt(profile.getApiKeyCipher()));
    }

    /** 测尚未保存的表单内容（新增页面上直接点「测试连接」）。 */
    public ModelProfileDTO.TestResult testDraft(ModelProfileDTO.TestRequest req) {
        if (req.getProviderType() == ProviderType.OPENAI_COMPATIBLE
                && (req.getBaseUrl() == null || req.getBaseUrl().isBlank())) {
            throw new BizException("OpenAI 兼容协议必须填写 baseURL");
        }
        ModelProfile draft = new ModelProfile();
        draft.setProviderType(req.getProviderType());
        draft.setBaseUrl(normalizeBaseUrl(req.getBaseUrl()));
        draft.setModelName(req.getModelName());
        return tester.test(draft, req.getApiKey());
    }

    /* ---------------------------------------------------------- 内部 */

    private void validate(ModelProfileDTO.Upsert req, boolean creating) {
        if (req.getProviderType() == ProviderType.OPENAI_COMPATIBLE
                && (req.getBaseUrl() == null || req.getBaseUrl().isBlank())) {
            throw new BizException("OpenAI 兼容协议必须填写 baseURL");
        }
        if (creating && (req.getApiKey() == null || req.getApiKey().isBlank())) {
            throw new BizException("apiKey 不能为空");
        }
        if (!Boolean.TRUE.equals(req.getCanGenerate()) && !Boolean.TRUE.equals(req.getCanGrade())) {
            throw new BizException("「可用于出题」与「可用于阅卷」至少要开启一项");
        }
        String url = req.getBaseUrl();
        if (url != null && !url.isBlank()
                && !url.startsWith("http://") && !url.startsWith("https://")) {
            throw new BizException("baseURL 必须以 http:// 或 https:// 开头");
        }
    }

    private boolean nameExists(String name, Long excludeId) {
        return mapper.exists(Wrappers.<ModelProfile>lambdaQuery()
                .eq(ModelProfile::getName, name)
                .ne(excludeId != null, ModelProfile::getId, excludeId));
    }

    private void apply(ModelProfile profile, ModelProfileDTO.Upsert req) {
        profile.setName(req.getName().trim());
        profile.setProviderType(req.getProviderType());
        profile.setBaseUrl(normalizeBaseUrl(req.getBaseUrl()));
        profile.setModelName(req.getModelName().trim());
        profile.setCanGenerate(Boolean.TRUE.equals(req.getCanGenerate()));
        profile.setCanGrade(Boolean.TRUE.equals(req.getCanGrade()));
        profile.setTemperature(req.getTemperature());
        profile.setMaxTokens(req.getMaxTokens());
        profile.setSupportsJsonMode(Boolean.TRUE.equals(req.getSupportsJsonMode()));
        profile.setEnabled(Boolean.TRUE.equals(req.getEnabled()));
        profile.setRemark(req.getRemark());
    }

    /** 去掉末尾斜杠 —— 用户常复制成 "https://api.deepseek.com/v1/"，拼路径会变成双斜杠。 */
    private String normalizeBaseUrl(String url) {
        if (url == null || url.isBlank()) return null;
        String trimmed = url.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private ModelProfileDTO.View toView(ModelProfile p) {
        ModelProfileDTO.View v = new ModelProfileDTO.View();
        v.setId(p.getId());
        v.setName(p.getName());
        v.setProviderType(p.getProviderType());
        v.setBaseUrl(p.getBaseUrl());
        v.setApiKeyMask(CryptoService.mask(crypto.decrypt(p.getApiKeyCipher())));
        v.setModelName(p.getModelName());
        v.setCanGenerate(p.getCanGenerate());
        v.setCanGrade(p.getCanGrade());
        v.setIsDefaultGenerate(p.getIsDefaultGenerate());
        v.setIsDefaultGrade(p.getIsDefaultGrade());
        v.setTemperature(p.getTemperature());
        v.setMaxTokens(p.getMaxTokens());
        v.setSupportsJsonMode(p.getSupportsJsonMode());
        v.setEnabled(p.getEnabled());
        v.setRemark(p.getRemark());
        v.setCreatedAt(p.getCreatedAt());
        v.setUpdatedAt(p.getUpdatedAt());
        return v;
    }
}
