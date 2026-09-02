-- 可管理的主分类（替代纯枚举白名单；内置项可改名，不可删）
CREATE TABLE exam_category (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL UNIQUE,
    label      TEXT    NOT NULL,
    builtin    INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO exam_category (code, label, builtin, enabled, sort_order) VALUES
    ('RAG', 'RAG', 1, 1, 10),
    ('AGENT', 'Agent', 1, 1, 20),
    ('MULTI_AGENT', 'Multi-Agent', 1, 1, 30),
    ('LLM_BASICS', 'LLM基础', 1, 1, 40),
    ('PROMPT', 'Prompt工程', 1, 1, 50),
    ('EVAL', 'Eval', 1, 1, 60),
    ('CONTEXT', 'Context工程', 1, 1, 70),
    ('INTERVIEW', '面试综合', 1, 1, 80);
