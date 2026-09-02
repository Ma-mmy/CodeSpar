package com.codespar.service;

import com.codespar.model.dto.WrongQuestionDTO.Item;
import com.codespar.web.ApiExceptionHandler.BizException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WrongQuestionServiceTest {

    @Test
    void pickIdsUsesPoolWhenNoSelection() {
        List<Item> pool = List.of(item(1), item(2), item(3), item(4));
        assertEquals(List.of(1L, 2L), WrongQuestionService.pickIds(pool, List.of(), 2, 30));
    }

    @Test
    void pickIdsKeepsPoolOrderOfSelection() {
        List<Item> pool = List.of(item(10), item(20), item(30));
        assertEquals(List.of(10L, 30L), WrongQuestionService.pickIds(pool, List.of(30L, 10L), 10, 30));
    }

    @Test
    void pickIdsRejectsUnknown() {
        List<Item> pool = List.of(item(1));
        assertThrows(BizException.class, () -> WrongQuestionService.pickIds(pool, List.of(1L, 9L), 10, 30));
    }

    @Test
    void pickIdsEmptyThrows() {
        assertThrows(BizException.class, () -> WrongQuestionService.pickIds(List.of(), List.of(), 10, 30));
    }

    private static Item item(long questionId) {
        Item i = new Item();
        i.setQuestionId(questionId);
        return i;
    }
}
