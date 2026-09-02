-- 文章栏目：文件夹树 + 文章 + 与出题/试卷关联

CREATE TABLE article_folder (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id  INTEGER,
    name       TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_article_folder_parent ON article_folder (parent_id);

CREATE TABLE article (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id          INTEGER,
    title              TEXT    NOT NULL,
    category           TEXT,
    body_md            TEXT    NOT NULL,
    body_hash          TEXT,
    summary_md         TEXT,
    summary_json       TEXT,
    summary_status     TEXT    NOT NULL DEFAULT 'NONE',
    summary_error      TEXT,
    summary_model_id   INTEGER,
    summary_model_snap TEXT,
    created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_article_folder ON article (folder_id);
CREATE INDEX idx_article_category ON article (category);
CREATE INDEX idx_article_summary_status ON article (summary_status);

ALTER TABLE generation_job ADD COLUMN article_id INTEGER;
CREATE INDEX idx_generation_job_article ON generation_job (article_id);

ALTER TABLE exam ADD COLUMN article_id INTEGER;
CREATE INDEX idx_exam_article ON exam (article_id);
