package com.codespar.service;

import com.codespar.mapper.GenerationCountPresetMapper;
import com.codespar.model.dto.GenerationDTO.CountPresetRequest;
import com.codespar.model.dto.GenerationDTO.CountPresetView;
import com.codespar.model.entity.GenerationCountPreset;
import com.codespar.model.enums.QuestionType;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 出题页「题型与数量」预设，落 SQLite，全实例共用一行。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GenerationCountPresetService {

    static final long ROW_ID = 1L;

    private static final TypeReference<LinkedHashMap<QuestionType, Integer>> COUNTS_TYPE =
            new TypeReference<>() {};

    private final GenerationCountPresetMapper mapper;
    private final ObjectMapper objectMapper;

    public CountPresetView get() {
        GenerationCountPreset row = mapper.selectById(ROW_ID);
        if (row == null || row.getCountsJson() == null || row.getCountsJson().isBlank()) {
            return CountPresetView.of(defaults(), false);
        }
        try {
            return CountPresetView.of(normalize(parse(row.getCountsJson())), true);
        } catch (Exception e) {
            log.warn("题型数量预设损坏，回退默认：{}", e.getMessage());
            return CountPresetView.of(defaults(), false);
        }
    }

    @Transactional
    public CountPresetView save(CountPresetRequest req) {
        Map<QuestionType, Integer> counts = normalize(req == null ? null : req.getCounts());
        String json = toJson(counts);
        GenerationCountPreset row = mapper.selectById(ROW_ID);
        if (row == null) {
            row = new GenerationCountPreset();
            row.setId(ROW_ID);
            row.setCountsJson(json);
            mapper.insert(row);
        } else {
            row.setCountsJson(json);
            mapper.updateById(row);
        }
        return CountPresetView.of(counts, true);
    }

    static Map<QuestionType, Integer> defaults() {
        Map<QuestionType, Integer> d = new LinkedHashMap<>();
        d.put(QuestionType.SINGLE_CHOICE, 4);
        d.put(QuestionType.MULTI_CHOICE, 2);
        d.put(QuestionType.TRUE_FALSE, 2);
        d.put(QuestionType.FILL_BLANK, 2);
        d.put(QuestionType.SHORT_ANSWER, 3);
        d.put(QuestionType.SYSTEM_DESIGN, 1);
        return d;
    }

    static Map<QuestionType, Integer> normalize(Map<QuestionType, Integer> raw) {
        GenerationService.validateCounts(raw);
        Map<QuestionType, Integer> next = new LinkedHashMap<>();
        for (QuestionType t : QuestionType.values()) {
            Integer v = raw.get(t);
            if (v != null && v > 0) {
                next.put(t, v);
            }
        }
        if (next.isEmpty()) {
            throw new BizException("请至少设置一种题型且数量大于 0");
        }
        return next;
    }

    private Map<QuestionType, Integer> parse(String json) {
        try {
            Map<QuestionType, Integer> parsed = objectMapper.readValue(json, COUNTS_TYPE);
            return parsed == null ? Map.of() : parsed;
        } catch (Exception e) {
            throw new IllegalStateException("题型数量预设无法解析", e);
        }
    }

    private String toJson(Map<QuestionType, Integer> counts) {
        try {
            return objectMapper.writeValueAsString(counts);
        } catch (Exception e) {
            throw new IllegalStateException("题型数量预设序列化失败", e);
        }
    }
}
