package com.codespar.service;

import com.codespar.model.enums.QuestionType;
import com.codespar.web.ApiExceptionHandler.BizException;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GenerationCountPresetServiceTest {

    @Test
    void normalizeKeepsPerTypeCapAndDropsZeros() {
        Map<QuestionType, Integer> next = GenerationCountPresetService.normalize(Map.of(
                QuestionType.SINGLE_CHOICE, 20,
                QuestionType.SHORT_ANSWER, 0,
                QuestionType.SYSTEM_DESIGN, 15));
        assertEquals(20, next.get(QuestionType.SINGLE_CHOICE));
        assertEquals(15, next.get(QuestionType.SYSTEM_DESIGN));
        assertEquals(2, next.size());
    }

    @Test
    void normalizeRejectsEmpty() {
        assertThrows(BizException.class, () -> GenerationCountPresetService.normalize(Map.of()));
        assertThrows(BizException.class, () -> GenerationCountPresetService.normalize(null));
    }

    @Test
    void defaultsSumToFourteen() {
        int total = GenerationCountPresetService.defaults().values().stream().mapToInt(Integer::intValue).sum();
        assertEquals(14, total);
    }
}
