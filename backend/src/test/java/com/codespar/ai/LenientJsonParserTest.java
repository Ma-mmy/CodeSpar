package com.codespar.ai;

import com.codespar.ai.QuestionBatchDTO.QuestionDTO;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 宽松解析的四道防线各覆盖一条典型场景。
 */
class LenientJsonParserTest {

    private final LenientJsonParser parser = new LenientJsonParser();

    private static final String VALID = """
            {"questions":[{"type":"SHORT_ANSWER","difficulty":"INTERMEDIATE","stem":"什么是 RAG？","referenceAnswer":"Retrieval-Augmented Generation…","rubric":[{"point":"定义了 RAG","score":3}],"fullScore":10}]}
            """;

    @Test
    void parsesCleanJsonDirectly() {
        QuestionBatchDTO.Batch batch = parser.parse(VALID, QuestionBatchDTO.Batch.class);
        assertEquals(1, batch.getQuestions().size());
        assertEquals("什么是 RAG？", batch.getQuestions().get(0).getStem());
    }

    @Test
    void stripsMarkdownFence() {
        String fenced = "```json\n" + VALID + "\n```";
        QuestionBatchDTO.Batch batch = parser.parse(fenced, QuestionBatchDTO.Batch.class);
        assertEquals(1, batch.getQuestions().size());
    }

    @Test
    void extractsJsonFromSurroundingText() {
        String noisy = "好的，以下是为您生成的题目：\n" + VALID + "\n（共 1 题）";
        QuestionBatchDTO.Batch batch = parser.parse(noisy, QuestionBatchDTO.Batch.class);
        assertEquals(1, batch.getQuestions().size());
    }

    @Test
    void repairsTrailingCommaAndUnescapedNewline() {
        String messy = """
                {"questions":[{"type":"SHORT_ANSWER","difficulty":"INTERMEDIATE",
                "stem":"第一行\n第二行","tags":["RAG","Eval"],
                "referenceAnswer":"参考答案","rubric":[{"point":"要点","score":5}],"fullScore":10,}]}
                """;
        QuestionBatchDTO.Batch batch = parser.parse(messy, QuestionBatchDTO.Batch.class);
        QuestionDTO q = batch.getQuestions().get(0);
        assertTrue(q.getStem().contains("第二行"), "字符串内未转义换行应被放行");
    }

    @Test
    void repairsFullWidthQuotes() {
        String fullWidth = """
                {"questions":[{"type":"TRUE_FALSE","difficulty":"BEGINNER","stem":"“RAG 一定比纯生成好”，这句话对吗？","options":[{"key":"T","text":"正确"},{"key":"F","text":"错误"}],"correctAnswer":"F","referenceAnswer":"不一定","rubric":[{"point":"判断","score":3}],"fullScore":5}]}
                """;
        QuestionBatchDTO.Batch batch = parser.parse(fullWidth, QuestionBatchDTO.Batch.class);
        assertEquals("“RAG 一定比纯生成好”，这句话对吗？", batch.getQuestions().get(0).getStem());
    }

    @Test
    void ignoresUnknownEnumAsNull() {
        String badEnum = """
                {"questions":[{"type":"ESSAY","difficulty":"INTERMEDIATE","stem":"x","referenceAnswer":"y","rubric":[{"point":"p","score":1}],"fullScore":1}]}
                """;
        QuestionBatchDTO.Batch batch = parser.parse(badEnum, QuestionBatchDTO.Batch.class);
        assertNull(batch.getQuestions().get(0).getType(), "未知枚举应按 null 处理，交给业务校验拦截");
    }

    @Test
    void throwsWithUsefulMessageWhenAllFail() {
        assertThrows(IllegalStateException.class,
                () -> parser.parse("这不是 JSON", QuestionBatchDTO.Batch.class));
    }

    @Test
    void mapsChineseTypeAndDifficultyAliases() {
        String chinese = """
                {"questions":[{"type":"概念问答","difficulty":"中级","stem":"讲讲 RAG","referenceAnswer":"答案","rubric":[{"point":"要点","score":5}],"fullScore":5}]}
                """;
        QuestionDTO q = parser.parse(chinese, QuestionBatchDTO.Batch.class).getQuestions().get(0);
        assertEquals(com.codespar.model.enums.QuestionType.SHORT_ANSWER, q.getType());
        assertEquals(com.codespar.model.enums.QuestionDifficulty.INTERMEDIATE, q.getDifficulty());
    }

    @Test
    void mapsRubricScoreAlias() {
        String chineseKey = """
                {"questions":[{"type":"SHORT_ANSWER","difficulty":"INTERMEDIATE","stem":"x","referenceAnswer":"y","rubric":[{"point":"要点","分值":4}],"fullScore":4}]}
                """;
        QuestionDTO q = parser.parse(chineseKey, QuestionBatchDTO.Batch.class).getQuestions().get(0);
        assertEquals(4, q.getRubric().get(0).getScore());
    }
}
