package com.codespar.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ArticleServiceTitleTest {

    @Test
    void derivesTitleFromCompleteFilenameInsteadOfMarkdownHeading() {
        assertEquals("1_更新记录", ArticleService.deriveTitleFromFilename("1_更新记录.md"));
        assertEquals("02.Release_Notes", ArticleService.deriveTitleFromFilename("docs/02.Release_Notes.MD"));
    }
}
