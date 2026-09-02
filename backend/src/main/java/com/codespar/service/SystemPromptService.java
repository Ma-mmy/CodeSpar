package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.mapper.SystemPromptOverrideMapper;
import com.codespar.model.dto.SystemPromptDTO.PromptMeta;
import com.codespar.model.dto.SystemPromptDTO.ResetRequest;
import com.codespar.model.dto.SystemPromptDTO.SaveRequest;
import com.codespar.model.dto.SystemPromptDTO.SlotMeta;
import com.codespar.model.entity.SystemPromptOverride;
import com.codespar.service.SystemPromptCatalog.PromptDef;
import com.codespar.web.ApiExceptionHandler.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SystemPromptService {

    private final SystemPromptOverrideMapper mapper;

    public List<PromptMeta> list() {
        Map<String, Map<String, String>> overrides = loadAllOverrides();
        return SystemPromptCatalog.all().stream()
                .map(def -> toMeta(def, overrides.getOrDefault(def.key(), Map.of())))
                .toList();
    }

    public PromptMeta get(String promptKey) {
        PromptDef def = SystemPromptCatalog.byKey().get(promptKey);
        if (def == null) {
            throw new BizException("未知提示词：" + promptKey);
        }
        return toMeta(def, loadOverrides(promptKey));
    }

    /** 供 PromptBuilder 注入：返回 slotKey → 生效文案。 */
    public Map<String, String> resolveSlots(String promptKey) {
        PromptDef def = SystemPromptCatalog.byKey().get(promptKey);
        if (def == null) {
            return Map.of();
        }
        Map<String, String> overrides = loadOverrides(promptKey);
        Map<String, String> out = new LinkedHashMap<>();
        for (SlotMeta s : def.slots()) {
            String v = overrides.get(s.getKey());
            out.put(s.getKey(), v != null ? v : s.getDefaultValue());
        }
        return out;
    }

    @Transactional
    public PromptMeta save(SaveRequest req) {
        PromptDef def = SystemPromptCatalog.byKey().get(req.getPromptKey());
        if (def == null) {
            throw new BizException("未知提示词：" + req.getPromptKey());
        }
        Map<String, SlotMeta> allowed = new HashMap<>();
        for (SlotMeta s : def.slots()) {
            allowed.put(s.getKey(), s);
        }
        for (Map.Entry<String, String> e : req.getSlots().entrySet()) {
            if (!allowed.containsKey(e.getKey())) {
                throw new BizException("未知槽位：" + e.getKey());
            }
            String content = e.getValue() == null ? "" : e.getValue().trim();
            if (content.isEmpty()) {
                throw new BizException("槽位内容不能为空：" + e.getKey());
            }
            SlotMeta meta = allowed.get(e.getKey());
            if (content.equals(meta.getDefaultValue())) {
                // 与默认相同则删除覆盖
                mapper.delete(Wrappers.<SystemPromptOverride>lambdaQuery()
                        .eq(SystemPromptOverride::getPromptKey, req.getPromptKey())
                        .eq(SystemPromptOverride::getSlotKey, e.getKey()));
                continue;
            }
            SystemPromptOverride existing = mapper.selectOne(Wrappers.<SystemPromptOverride>lambdaQuery()
                    .eq(SystemPromptOverride::getPromptKey, req.getPromptKey())
                    .eq(SystemPromptOverride::getSlotKey, e.getKey())
                    .last("LIMIT 1"));
            if (existing == null) {
                SystemPromptOverride row = new SystemPromptOverride();
                row.setPromptKey(req.getPromptKey());
                row.setSlotKey(e.getKey());
                row.setContent(content);
                mapper.insert(row);
            } else {
                existing.setContent(content);
                mapper.updateById(existing);
            }
        }
        return get(req.getPromptKey());
    }

    @Transactional
    public PromptMeta reset(ResetRequest req) {
        PromptDef def = SystemPromptCatalog.byKey().get(req.getPromptKey());
        if (def == null) {
            throw new BizException("未知提示词：" + req.getPromptKey());
        }
        var q = Wrappers.<SystemPromptOverride>lambdaQuery()
                .eq(SystemPromptOverride::getPromptKey, req.getPromptKey());
        if (req.getSlotKey() != null && !req.getSlotKey().isBlank()) {
            q.eq(SystemPromptOverride::getSlotKey, req.getSlotKey().trim());
        }
        mapper.delete(q);
        return get(req.getPromptKey());
    }

    private Map<String, String> loadOverrides(String promptKey) {
        Map<String, String> map = new HashMap<>();
        for (SystemPromptOverride row : mapper.selectList(Wrappers.<SystemPromptOverride>lambdaQuery()
                .eq(SystemPromptOverride::getPromptKey, promptKey))) {
            map.put(row.getSlotKey(), row.getContent());
        }
        return map;
    }

    private Map<String, Map<String, String>> loadAllOverrides() {
        Map<String, Map<String, String>> all = new HashMap<>();
        for (SystemPromptOverride row : mapper.selectList(null)) {
            all.computeIfAbsent(row.getPromptKey(), k -> new HashMap<>())
                    .put(row.getSlotKey(), row.getContent());
        }
        return all;
    }

    private PromptMeta toMeta(PromptDef def, Map<String, String> overrides) {
        PromptMeta meta = new PromptMeta();
        meta.setKey(def.key());
        meta.setLabel(def.label());
        meta.setDescription(def.description());
        meta.setSlots(def.slots());
        Map<String, String> values = new LinkedHashMap<>();
        Map<String, Boolean> overridden = new LinkedHashMap<>();
        for (SlotMeta s : def.slots()) {
            String ov = overrides.get(s.getKey());
            values.put(s.getKey(), ov != null ? ov : s.getDefaultValue());
            overridden.put(s.getKey(), ov != null);
        }
        meta.setValues(values);
        meta.setOverridden(overridden);
        return meta;
    }
}
