package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.mapper.PromptPresetMapper;
import com.codespar.model.dto.PromptPresetDTO;
import com.codespar.model.dto.PromptPresetDTO.Params;
import com.codespar.model.dto.PromptPresetDTO.Rename;
import com.codespar.model.dto.PromptPresetDTO.Upsert;
import com.codespar.model.dto.PromptPresetDTO.View;
import com.codespar.model.entity.PromptPreset;
import com.codespar.model.enums.DedupStrength;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class PromptPresetService {

    private final PromptPresetMapper mapper;
    private final ObjectMapper objectMapper;

    @PostConstruct
    public void ensureBuiltins() {
        long builtins = mapper.selectCount(Wrappers.<PromptPreset>lambdaQuery()
                .eq(PromptPreset::getBuiltin, true));
        if (builtins > 0) {
            return;
        }
        log.info("写入内置出题预设…");
        for (Builtin b : builtins()) {
            if (mapper.selectCount(Wrappers.<PromptPreset>lambdaQuery()
                    .eq(PromptPreset::getName, b.name())) > 0) {
                continue;
            }
            PromptPreset p = new PromptPreset();
            p.setName(b.name());
            p.setPrompt(b.prompt());
            p.setParamsJson(toJson(b.params()));
            p.setBuiltin(true);
            mapper.insert(p);
        }
    }

    public List<View> list() {
        ensureBuiltins();
        return mapper.selectList(Wrappers.<PromptPreset>lambdaQuery()
                        .orderByDesc(PromptPreset::getBuiltin)
                        .orderByAsc(PromptPreset::getId))
                .stream()
                .map(this::toView)
                .toList();
    }

    public View get(Long id) {
        return toView(getRequired(id));
    }

    @Transactional
    public View create(Upsert req) {
        String name = req.getName().trim();
        if (nameExists(name, null)) {
            throw new BizException("预设名称已存在：" + name);
        }
        PromptPreset p = new PromptPreset();
        p.setName(name);
        p.setPrompt(req.getPrompt().trim());
        p.setParamsJson(toJson(normalizeParams(req.getParams())));
        p.setBuiltin(false);
        mapper.insert(p);
        return toView(mapper.selectById(p.getId()));
    }

    @Transactional
    public View update(Long id, Upsert req) {
        PromptPreset p = getRequired(id);
        if (Boolean.TRUE.equals(p.getBuiltin())) {
            throw new BizException("内置预设不可修改，请「另存为」一份自己的");
        }
        String name = req.getName().trim();
        if (nameExists(name, id)) {
            throw new BizException("预设名称已存在：" + name);
        }
        p.setName(name);
        p.setPrompt(req.getPrompt().trim());
        p.setParamsJson(toJson(normalizeParams(req.getParams())));
        mapper.updateById(p);
        return toView(mapper.selectById(id));
    }

    @Transactional
    public View rename(Long id, Rename req) {
        PromptPreset p = getRequired(id);
        if (Boolean.TRUE.equals(p.getBuiltin())) {
            throw new BizException("内置预设不可改名");
        }
        String name = req.getName().trim();
        if (nameExists(name, id)) {
            throw new BizException("预设名称已存在：" + name);
        }
        p.setName(name);
        mapper.updateById(p);
        return toView(mapper.selectById(id));
    }

    @Transactional
    public void delete(Long id) {
        PromptPreset p = getRequired(id);
        if (Boolean.TRUE.equals(p.getBuiltin())) {
            throw new BizException("内置预设不可删除");
        }
        mapper.deleteById(id);
    }

    private PromptPreset getRequired(Long id) {
        PromptPreset p = mapper.selectById(id);
        if (p == null) {
            throw new BizException("预设不存在：" + id);
        }
        return p;
    }

    private boolean nameExists(String name, Long excludeId) {
        var q = Wrappers.<PromptPreset>lambdaQuery().eq(PromptPreset::getName, name);
        if (excludeId != null) {
            q.ne(PromptPreset::getId, excludeId);
        }
        return mapper.selectCount(q) > 0;
    }

    private View toView(PromptPreset p) {
        View v = new View();
        v.setId(p.getId());
        v.setName(p.getName());
        v.setPrompt(p.getPrompt());
        v.setParams(parseParams(p.getParamsJson()));
        v.setBuiltin(Boolean.TRUE.equals(p.getBuiltin()));
        v.setCreatedAt(p.getCreatedAt());
        v.setUpdatedAt(p.getUpdatedAt());
        return v;
    }

    private Params normalizeParams(Params in) {
        Params p = in == null ? new Params() : in;
        if (p.getDifficulty() == null) {
            p.setDifficulty(QuestionDifficulty.ADVANCED);
        }
        if (p.getLanguage() == null || p.getLanguage().isBlank()) {
            p.setLanguage("zh");
        }
        if (p.getDedupStrength() == null) {
            p.setDedupStrength(DedupStrength.STANDARD);
        }
        if (p.getCounts() == null) {
            p.setCounts(Map.of());
        }
        if (p.getTags() == null) {
            p.setTags(List.of());
        }
        return p;
    }

    private Params parseParams(String json) {
        if (json == null || json.isBlank()) {
            return normalizeParams(null);
        }
        try {
            return normalizeParams(objectMapper.readValue(json, Params.class));
        } catch (Exception e) {
            log.warn("预设参数损坏，使用默认：{}", e.getMessage());
            return normalizeParams(null);
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 序列化失败", e);
        }
    }

    private static List<Builtin> builtins() {
        return List.of(
                new Builtin(
                        "Agent 架构设计专项",
                        "围绕生产级 Agent 系统架构出题。重点考察：工具调用与规划循环、记忆与状态管理、权限与安全边界、可观测性与失败降级、与业务系统的集成方式。题目要贴近真实工程权衡，避免空泛背诵定义。",
                        params(Map.of(
                                QuestionType.SHORT_ANSWER, 4,
                                QuestionType.SYSTEM_DESIGN, 1,
                                QuestionType.SINGLE_CHOICE, 3),
                                QuestionDifficulty.ADVANCED,
                                List.of("Agent"),
                                "AGENT",
                                "zh", DedupStrength.STANDARD)),
                new Builtin(
                        "RAG 工程实战专项",
                        "围绕生产级 RAG 系统的检索质量优化出题。重点考察召回率与精确率的取舍、chunk 策略、rerank、混合检索、索引更新与数据新鲜度、评测与线上故障排查。题目贴近真实故障场景，不要考背诵定义。",
                        params(Map.of(
                                QuestionType.SINGLE_CHOICE, 4,
                                QuestionType.MULTI_CHOICE, 2,
                                QuestionType.SHORT_ANSWER, 3,
                                QuestionType.SYSTEM_DESIGN, 1),
                                QuestionDifficulty.ADVANCED,
                                List.of("RAG"),
                                "RAG",
                                "zh", DedupStrength.STANDARD)),
                new Builtin(
                        "LLM 基础八股速刷",
                        "出一套 LLM / Agent 方向的基础客观题速刷卷。覆盖 Transformer 要点、上下文窗口、温度与采样、常见幻觉原因、基础 RAG 概念、Function Calling 基本用法。题干简洁，适合考前快速过一遍，控制 token。",
                        params(Map.of(
                                QuestionType.SINGLE_CHOICE, 10,
                                QuestionType.TRUE_FALSE, 5,
                                QuestionType.MULTI_CHOICE, 5),
                                QuestionDifficulty.INTERMEDIATE,
                                List.of("LLM基础"),
                                "LLM_BASICS",
                                "zh", DedupStrength.STANDARD)),
                new Builtin(
                        "Multi-Agent 协作与通信",
                        "围绕 Multi-Agent 协作与通信出题。重点考察任务分解与委派、共享状态与消息协议、冲突消解与仲裁、角色分工、并行与串行编排、失败重试与人机回环。要求贴近真实多 Agent 产品设计。",
                        params(Map.of(
                                QuestionType.SHORT_ANSWER, 3,
                                QuestionType.SYSTEM_DESIGN, 1,
                                QuestionType.SINGLE_CHOICE, 3,
                                QuestionType.FILL_BLANK, 2),
                                QuestionDifficulty.ADVANCED,
                                List.of("Multi-Agent"),
                                "MULTI_AGENT",
                                "zh", DedupStrength.STANDARD)),
                new Builtin(
                        "模拟真实面试轮",
                        "模拟一轮约 60 分钟的 Agent / LLM 应用工程师技术面。混合题型：先热身客观题，再概念问答，最后一道系统设计。难度偏高级，考察表达清晰度与工程权衡，不要出偏题怪题。",
                        params(Map.of(
                                QuestionType.SINGLE_CHOICE, 3,
                                QuestionType.TRUE_FALSE, 2,
                                QuestionType.SHORT_ANSWER, 2,
                                QuestionType.SYSTEM_DESIGN, 1),
                                QuestionDifficulty.ADVANCED,
                                List.of("面试综合"),
                                "INTERVIEW",
                                "zh", DedupStrength.STANDARD))
        );
    }

    private static Params params(Map<QuestionType, Integer> counts,
                                 QuestionDifficulty difficulty,
                                 List<String> tags,
                                 String category,
                                 String language,
                                 DedupStrength dedup) {
        Params p = new Params();
        p.setCounts(new LinkedHashMap<>(counts));
        p.setDifficulty(difficulty);
        p.setTags(tags);
        p.setCategory(category);
        p.setLanguage(language);
        p.setDedupStrength(dedup);
        return p;
    }

    private record Builtin(String name, String prompt, Params params) {}
}
