package com.codespar.service;

import com.codespar.mapper.ArticleMapper;
import com.codespar.model.dto.ArticleDTO.OpenContext;
import com.codespar.model.entity.Article;
import com.codespar.model.enums.ArticleContextMode;
import com.codespar.web.ApiExceptionHandler.BizException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Proxy;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ArticleServiceOpenContextTest {

    @TempDir
    Path tempDir;

    @Test
    void originalModeAllowsUnrefinedArticle() {
        Article article = article("NONE", "完整原文");
        OpenContext context = service(article).openContext(1L, ArticleContextMode.ORIGINAL);

        assertEquals(ArticleContextMode.ORIGINAL, context.getArticleContextMode());
        assertTrue(context.getPrompt().contains("原文"));
    }

    @Test
    void summaryModeRequiresReadyOrStaleSummary() {
        for (String status : new String[]{"NONE", "FAILED"}) {
            Article article = article(status, "正文");
            assertThrows(BizException.class,
                    () -> service(article).openContext(1L, ArticleContextMode.SUMMARY));
        }
        for (String status : new String[]{"READY", "STALE"}) {
            Article article = article(status, "正文");
            article.setSummaryMd("摘要");
            assertEquals(ArticleContextMode.SUMMARY,
                    service(article).openContext(1L, ArticleContextMode.SUMMARY).getArticleContextMode());
        }
    }

    @Test
    void originalModeRejectsEmptyOrMissingBody() {
        assertThrows(BizException.class,
                () -> service(article("NONE", "  ")).openContext(1L, ArticleContextMode.ORIGINAL));

        Article missingFile = article("NONE", "旧缓存");
        missingFile.setSourcePath("missing.md");
        assertThrows(BizException.class,
                () -> service(missingFile).openContext(1L, ArticleContextMode.ORIGINAL));
    }

    private ArticleService service(Article article) {
        ArticleMapper mapper = (ArticleMapper) Proxy.newProxyInstance(
                ArticleMapper.class.getClassLoader(),
                new Class<?>[]{ArticleMapper.class},
                (proxy, method, args) -> method.getName().equals("selectById") ? article : null);
        NotesPath notesPath = new NotesPath(tempDir.toString(), "jdbc:sqlite:" + tempDir.resolve("codespar.db"));
        return new ArticleService(null, mapper, null, null, null, null,
                null, null, null, null, null, notesPath);
    }

    private static Article article(String summaryStatus, String body) {
        Article article = new Article();
        article.setId(1L);
        article.setTitle("测试文章");
        article.setBodyMd(body);
        article.setSummaryStatus(summaryStatus);
        return article;
    }
}
