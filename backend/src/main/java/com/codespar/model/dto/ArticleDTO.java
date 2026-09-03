package com.codespar.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

public class ArticleDTO {

    @Data
    public static class FolderView {
        private Long id;
        private Long parentId;
        private String name;
        private Integer sortOrder;
        private LocalDateTime createdAt;
        private List<FolderView> children;
        private List<ArticleListItem> articles;
    }

    @Data
    public static class ArticleListItem {
        private Long id;
        private Long folderId;
        private String title;
        private String category;
        private String categoryLabel;
        private String summaryStatus;
        private String sourcePath;
        private boolean missing;
        private LocalDateTime updatedAt;
        private LocalDateTime createdAt;
    }

    @Data
    public static class ArticleDetail {
        private Long id;
        private Long folderId;
        private String title;
        private String category;
        private String categoryLabel;
        private String bodyMd;
        private String sourcePath;
        private boolean missing;
        private String summaryMd;
        private Object summaryJson;
        private String summaryStatus;
        private String summaryError;
        private Long summaryModelId;
        private String summaryModelSnap;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        /** 开卷预填用的默认出题意图（短） */
        private String openPromptHint;
    }

    @Data
    public static class CreateFolderRequest {
        private Long parentId;

        @NotBlank(message = "请填写文件夹名称")
        @Size(max = 80, message = "文件夹名称不超过 80 字")
        private String name;
    }

    @Data
    public static class RenameFolderRequest {
        @NotBlank(message = "请填写文件夹名称")
        @Size(max = 80, message = "文件夹名称不超过 80 字")
        private String name;
    }

    @Data
    public static class MoveFolderRequest {
        /** 空 = 移到根 */
        private Long parentId;
        private Integer sortOrder;
    }

    @Data
    public static class UpsertArticleRequest {
        private Long folderId;

        @NotBlank(message = "请填写标题")
        @Size(max = 200, message = "标题不超过 200 字")
        private String title;

        /** ExamCategory.code，可空 */
        private String category;

        @NotBlank(message = "请填写正文")
        private String bodyMd;
    }

    @Data
    public static class MoveArticleRequest {
        private Long folderId;
    }

    @Data
    public static class RefineRequest {
        /** 空则用默认出题模型 */
        private Long modelProfileId;
        /** true = 强制重跑（即使已有 READY） */
        private boolean force;
    }

    /** 人工精修考点摘要（Markdown + 可选结构化 JSON）。 */
    @Data
    public static class UpdateSummaryRequest {
        /** 可读 Markdown；空串表示清空 */
        private String summaryMd;
        /** 结构化摘要；传 null 表示不改 JSON；传对象则覆盖 */
        private Object summaryJson;
    }

    @Data
    public static class OpenContext {
        private Long articleId;
        private String title;
        private String category;
        private String categoryLabel;
        private String summaryStatus;
        private String prompt;
        private String summaryMd;
    }

    @Data
    public static class SyncResult {
        private int added;
        private int updated;
        private int missing;
        private int skipped;
    }

    @Data
    public static class ArticleMeta {
        private String notesDir;
    }
}
