package com.codespar.ai;

import com.codespar.model.enums.QuestionType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PromptBuilderFieldSpecTest {

    @Test
    void objectiveFieldsAskExplanationNotRubric() {
        for (QuestionType type : new QuestionType[]{
                QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE,
                QuestionType.TRUE_FALSE, QuestionType.FILL_BLANK}) {
            String fields = PromptBuilder.outputFields(type, "面试");
            String intro = PromptBuilder.outputIntro(type);
            String spec = PromptBuilder.fieldSpec(type);
            assertTrue(fields.contains("explanation"), type.name());
            assertFalse(fields.contains("referenceAnswer"), type.name());
            assertFalse(fields.contains("rubric"), type.name());
            assertTrue(intro.contains("不要输出 referenceAnswer、rubric"), type.name());
            assertTrue(spec.contains("explanation"), type.name());
            assertTrue(spec.contains("不要输出 referenceAnswer、rubric"), type.name());
        }
    }

    @Test
    void subjectiveFieldsAskReferenceAndRubricNotExplanation() {
        for (QuestionType type : new QuestionType[]{QuestionType.SHORT_ANSWER, QuestionType.SYSTEM_DESIGN}) {
            String fields = PromptBuilder.outputFields(type, "面试");
            String intro = PromptBuilder.outputIntro(type);
            String spec = PromptBuilder.fieldSpec(type);
            assertTrue(fields.contains("referenceAnswer"), type.name());
            assertTrue(fields.contains("rubric"), type.name());
            assertFalse(fields.contains("explanation"), type.name());
            assertTrue(intro.contains("referenceAnswer"), type.name());
            assertTrue(intro.contains("不要输出 explanation"), type.name());
            assertTrue(spec.contains("不要输出 explanation"), type.name());
        }
    }

    @Test
    void choiceFieldsIncludeOptionsFillBlankDoesNot() {
        assertTrue(PromptBuilder.outputFields(QuestionType.SINGLE_CHOICE, "x").contains("options"));
        assertFalse(PromptBuilder.outputFields(QuestionType.FILL_BLANK, "x").contains("options"));
        assertTrue(PromptBuilder.outputFields(QuestionType.FILL_BLANK, "x").contains("acceptedAnswers"));
    }
}
