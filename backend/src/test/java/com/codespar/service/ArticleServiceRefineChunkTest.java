package com.codespar.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ArticleServiceRefineChunkTest {

    @Test
    void shortArticleStaysInOneChunk() {
        assertEquals(List.of("short article"), ArticleService.splitArticleBody("short article"));
    }

    @Test
    void longArticleIsSplitWithoutLosingContent() {
        String body = ("section content\n").repeat(6_000);
        List<String> chunks = ArticleService.splitArticleBody(body);

        assertTrue(chunks.size() > 1);
        assertEquals(body, String.join("", chunks));
        assertTrue(chunks.stream().allMatch(chunk -> chunk.length() <= 28_000));
    }

    @Test
    void normalizeRemovesNoiseButPreservesCodeIndentation() {
        String body = "#  Title  \n\n\n\ntext   with   spaces\n```java  \n  int   x = 1;  \n```\n";
        assertEquals("# Title\n\ntext with spaces\n```java\n  int   x = 1;  \n```", ArticleService.normalizeArticleBody(body));
    }
}
