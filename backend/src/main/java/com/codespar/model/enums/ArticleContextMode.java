package com.codespar.model.enums;

/** Which article content is injected into an article-linked generation. */
public enum ArticleContextMode {
    SUMMARY,
    ORIGINAL;

    public static ArticleContextMode orSummary(ArticleContextMode mode) {
        return mode == null ? SUMMARY : mode;
    }
}
