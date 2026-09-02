package com.codespar.service;

import com.codespar.model.dto.GenerationDTO.GenerateParams;
import com.codespar.model.dto.GenerationDTO.GenerateRequest;
import com.codespar.model.enums.QuestionType;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GenerationServiceTest {

    @Test
    void validateCountsRejectsEmpty() {
        assertThrows(BizException.class, () -> GenerationService.validateCounts(null));
        assertThrows(BizException.class, () -> GenerationService.validateCounts(Map.of()));
    }

    @Test
    void validateCountsRejectsAllZero() {
        assertThrows(BizException.class,
                () -> GenerationService.validateCounts(Map.of(QuestionType.SINGLE_CHOICE, 0)));
    }

    @Test
    void validateCountsRejectsNegative() {
        assertThrows(BizException.class,
                () -> GenerationService.validateCounts(Map.of(QuestionType.FILL_BLANK, -1)));
    }

    @Test
    void validateCountsRejectsOverPerType() {
        BizException ex = assertThrows(BizException.class,
                () -> GenerationService.validateCounts(Map.of(QuestionType.SHORT_ANSWER, 21)));
        assertTrue(ex.getMessage().contains("20"));
        assertTrue(ex.getMessage().contains("21"));
    }

    @Test
    void validateCountsAllowsTotalOverTwentyWhenEachTypeWithinCap() {
        int total = GenerationService.validateCounts(Map.of(
                QuestionType.SINGLE_CHOICE, 20,
                QuestionType.SHORT_ANSWER, 20,
                QuestionType.SYSTEM_DESIGN, 15));
        assertEquals(55, total);
    }

    @Test
    void validateCountsAcceptsPerTypeCap() {
        assertEquals(20, GenerationService.validateCounts(Map.of(QuestionType.MULTI_CHOICE, 20)));
    }

    @Test
    void generateParamsFromHonorsAutoOptimizeFalse() {
        GenerateRequest req = new GenerateRequest();
        req.setCounts(Map.of(QuestionType.SINGLE_CHOICE, 1));
        req.setModelProfileId(1L);
        req.setAutoOptimize(false);
        GenerateParams params = GenerateParams.from(req);
        assertFalse(params.shouldAutoOptimize());
        assertEquals(Boolean.FALSE, params.getAutoOptimize());
    }

    @Test
    void generateParamsFromDefaultsAutoOptimizeOn() {
        GenerateRequest req = new GenerateRequest();
        req.setCounts(Map.of(QuestionType.SINGLE_CHOICE, 1));
        req.setModelProfileId(1L);
        req.setAutoOptimize(null);
        GenerateParams params = GenerateParams.from(req);
        assertTrue(params.shouldAutoOptimize());
    }

    @Test
    void generateParamsRoundTripKeepsAutoOptimizeFalse() throws Exception {
        GenerateRequest req = new GenerateRequest();
        req.setCounts(Map.of(QuestionType.TRUE_FALSE, 2));
        req.setModelProfileId(3L);
        req.setAutoOptimize(false);
        ObjectMapper mapper = new ObjectMapper();
        String json = mapper.writeValueAsString(GenerateParams.from(req));
        assertTrue(json.contains("\"autoOptimize\":false"));
        GenerateParams parsed = mapper.readValue(json, GenerateParams.class);
        assertFalse(parsed.shouldAutoOptimize());
    }

    @Test
    void generateRequestDeserializesAutoOptimizeFalse() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        GenerateRequest req = mapper.readValue(
                "{\"prompt\":\"x\",\"counts\":{\"SINGLE_CHOICE\":1},\"modelProfileId\":1,\"autoOptimize\":false}",
                GenerateRequest.class);
        assertEquals(Boolean.FALSE, req.getAutoOptimize());
        assertFalse(GenerateParams.from(req).shouldAutoOptimize());
    }
}
