package com.codespar.service;

import com.codespar.model.dto.SystemPromptDTO.SlotMeta;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SystemPromptCatalogTest {

    @Test
    void generateDefaultRulesDropPaperEngineering() {
        String rules = slot("generate", "rules");
        assertFalse(rules.contains("试卷工程化"));
        assertFalse(rules.contains("题数与题型配比"));
        assertFalse(rules.contains("一次性出完"));
        assertFalse(rules.contains("choice/blank"));
        assertTrue(rules.contains("解析辨析"));
        assertTrue(rules.contains("陷阱"));
        assertTrue(rules.contains("实战优先"));
    }

    @Test
    void generateDefaultRoleDoesNotMentionRatio() {
        String role = slot("generate", "role");
        assertFalse(role.contains("配比裁定"));
        assertFalse(role.contains("配比准确性"));
    }

    private static String slot(String promptKey, String slotKey) {
        return SystemPromptCatalog.byKey().get(promptKey).slots().stream()
                .filter(s -> slotKey.equals(s.getKey()))
                .map(SlotMeta::getDefaultValue)
                .findFirst()
                .orElseThrow();
    }
}
