package com.codespar.service;

import com.codespar.model.enums.QuestionType;
import com.codespar.service.LocalScorer.ObjectiveResult;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LocalScorerTest {

    private final LocalScorer scorer = new LocalScorer();

    @Test
    void singleChoiceExact() {
        ObjectiveResult r = scorer.scoreChoice(QuestionType.SINGLE_CHOICE, "B", "b", 5);
        assertTrue(r.matched());
        assertEquals(0, r.score().compareTo(BigDecimal.valueOf(5)));
    }

    @Test
    void multiChoiceOrderInsensitive() {
        ObjectiveResult ok = scorer.scoreChoice(QuestionType.MULTI_CHOICE, "A,C", "C, A", 10);
        assertTrue(ok.matched());
        ObjectiveResult bad = scorer.scoreChoice(QuestionType.MULTI_CHOICE, "A,C", "A,B", 10);
        assertFalse(bad.matched());
    }

    @Test
    void fillBlankNormalizesFullWidthAndCase() {
        ObjectiveResult r = scorer.scoreFillBlank(List.of("RAG"), "ｒａｇ", 5);
        assertTrue(r.matched());
    }

    @Test
    void fillBlankMissTriggersSemantic() {
        ObjectiveResult r = scorer.scoreFillBlank(List.of("检索增强生成"), "一种用外部知识增强大模型的技术", 5);
        assertFalse(r.matched());
        assertEquals(0, r.score().compareTo(BigDecimal.ZERO));
    }

    @Test
    void fillBlankAcceptsJsonArrayFromFrontend() {
        ObjectiveResult r = scorer.scoreFillBlank(List.of("rerank"), "[\"rerank\"]", 5);
        assertTrue(r.matched());
        assertEquals(0, r.score().compareTo(BigDecimal.valueOf(5)));
    }

    @Test
    void normalizeTextStripsWhitespace() {
        assertEquals("hello", LocalScorer.normalizeText(" He Llo "));
    }
}
