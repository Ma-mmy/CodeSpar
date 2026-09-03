package com.codespar.service;

import com.codespar.ai.QuestionBatchDTO.Option;
import com.codespar.ai.QuestionBatchDTO.QuestionDTO;
import com.codespar.ai.QuestionBatchDTO.RubricPoint;
import com.codespar.model.enums.QuestionDifficulty;
import com.codespar.model.enums.QuestionType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QuestionDraftAcceptanceTest {

    private QuestionConverter converter;

    @BeforeEach
    void setUp() {
        QuestionTaggingService tagging = mock(QuestionTaggingService.class);
        when(tagging.canonicalize(nullable(List.class), nullable(String.class))).thenAnswer(inv -> {
            List<String> in = inv.getArgument(0);
            return in == null ? new ArrayList<String>() : new ArrayList<>(in);
        });
        converter = new QuestionConverter(new ObjectMapper(), tagging);
    }

    @Test
    void keepsValidSiblingsWhenOneRubricInvalid() {
        QuestionDTO bad = shortAnswer("坏题");
        bad.getRubric().get(0).setScore(5);

        var result = QuestionDraftAcceptance.accept(
                List.of(shortAnswer("好题一"), shortAnswer("好题二"), bad),
                converter, 9L, QuestionType.SHORT_ANSWER, null, null, 3);

        assertEquals(2, result.drafts().size());
        assertEquals("好题一", result.drafts().get(0).question().getStem());
        assertEquals("好题二", result.drafts().get(1).question().getStem());
        assertEquals(9L, result.drafts().get(0).question().getJobId());
        assertTrue(result.error().contains("还缺 1 道"));
        assertTrue(result.error().contains("第3题"));
        assertTrue(result.error().contains("不等于满分"));
    }

    @Test
    void allValidReturnsNoError() {
        var result = QuestionDraftAcceptance.accept(
                List.of(shortAnswer("A"), shortAnswer("B")),
                converter, 1L, QuestionType.SHORT_ANSWER, null, null, 2);

        assertEquals(2, result.drafts().size());
        assertNull(result.error());
    }

    @Test
    void capsAtRemainingNeed() {
        var result = QuestionDraftAcceptance.accept(
                List.of(shortAnswer("一"), shortAnswer("二"), shortAnswer("三")),
                converter, 1L, QuestionType.SHORT_ANSWER, null, null, 1);

        assertEquals(1, result.drafts().size());
        assertEquals("一", result.drafts().get(0).question().getStem());
        assertNull(result.error());
    }

    @Test
    void emptyListIsError() {
        var result = QuestionDraftAcceptance.accept(
                List.of(), converter, 1L, QuestionType.SHORT_ANSWER, null, null, 2);

        assertTrue(result.isEmpty());
        assertTrue(result.error().contains("没有返回任何题目"));
    }

    @Test
    void acceptsObjectiveWithoutReferenceOrRubric() {
        var result = QuestionDraftAcceptance.accept(
                List.of(singleChoice("磁盘饱和度指什么？")),
                converter, 1L, QuestionType.SINGLE_CHOICE, null, null, 1);

        assertEquals(1, result.drafts().size());
        assertNull(result.error());
        assertNull(result.drafts().get(0).question().getReferenceAnswer());
        assertNull(result.drafts().get(0).question().getRubricJson());
        assertEquals("使用率只表示忙碌时间占比", result.drafts().get(0).question().getExplanation());
    }

    @Test
    void tooFewValidReportsShortfall() {
        var result = QuestionDraftAcceptance.accept(
                List.of(shortAnswer("仅一题")),
                converter, 1L, QuestionType.SHORT_ANSWER, null, null, 3);

        assertEquals(1, result.drafts().size());
        assertTrue(result.error().contains("只收下 1 道"));
        assertTrue(result.error().contains("还缺 2 道"));
    }

    private static QuestionDTO shortAnswer(String stem) {
        QuestionDTO d = new QuestionDTO();
        d.setDifficulty(QuestionDifficulty.ADVANCED);
        d.setStem(stem);
        d.setReferenceAnswer("参考答案");
        d.setFullScore(10);
        RubricPoint a = new RubricPoint();
        a.setPoint("要点一");
        a.setScore(6);
        RubricPoint b = new RubricPoint();
        b.setPoint("要点二");
        b.setScore(4);
        d.setRubric(List.of(a, b));
        return d;
    }

    private static QuestionDTO singleChoice(String stem) {
        QuestionDTO d = new QuestionDTO();
        d.setDifficulty(QuestionDifficulty.ADVANCED);
        d.setStem(stem);
        d.setFullScore(5);
        d.setCorrectAnswer("B");
        d.setExplanation("使用率只表示忙碌时间占比");
        Option a = new Option();
        a.setKey("A");
        a.setText("磁盘吞吐已达上限");
        Option b = new Option();
        b.setKey("B");
        b.setText("磁盘无法及时接收新的 I/O");
        d.setOptions(List.of(a, b));
        return d;
    }
}
