-- CodeSpar 初始 schema（SQLite 版）
-- 转换规则：BIGINT 自增 → INTEGER PRIMARY KEY AUTOINCREMENT；VARCHAR/TEXT/MEDIUMTEXT/JSON → TEXT；
-- TINYINT/INT → INTEGER；DECIMAL → NUMERIC；DATETIME(3) → TEXT（时间戳由应用侧 MybatisMetaObjectHandler 填充）；
-- 索引独立成 CREATE INDEX；去掉 MySQL 的 COMMENT/ENGINE/CHARSET。

-- ============================================================
-- 模型配置
-- ============================================================
CREATE TABLE model_profile (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL UNIQUE,
    provider_type       TEXT    NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
    base_url            TEXT,
    api_key_cipher      TEXT    NOT NULL,
    model_name          TEXT    NOT NULL,
    can_generate        INTEGER NOT NULL DEFAULT 1,
    can_grade           INTEGER NOT NULL DEFAULT 1,
    is_default_generate INTEGER NOT NULL DEFAULT 0,
    is_default_grade    INTEGER NOT NULL DEFAULT 0,
    temperature         NUMERIC,
    max_tokens          INTEGER,
    supports_json_mode  INTEGER NOT NULL DEFAULT 0,
    enabled             INTEGER NOT NULL DEFAULT 1,
    remark              TEXT,
    created_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 知识点标签
-- ============================================================
CREATE TABLE tag (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 提示词预设
-- ============================================================
CREATE TABLE prompt_preset (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    prompt      TEXT    NOT NULL,
    params_json TEXT,
    builtin     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 出题任务（出题历史的载体）
-- ============================================================
CREATE TABLE generation_job (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt            TEXT    NOT NULL,
    params_json       TEXT    NOT NULL,
    model_profile_id  INTEGER NOT NULL,
    model_snapshot    TEXT,
    status            TEXT    NOT NULL DEFAULT 'RUNNING',
    requested_count   INTEGER NOT NULL DEFAULT 0,
    generated_count   INTEGER NOT NULL DEFAULT 0,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_ms           INTEGER NOT NULL DEFAULT 0,
    error_msg         TEXT,
    raw_output        TEXT,
    created_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_generation_job_created ON generation_job (created_at);
CREATE INDEX idx_generation_job_status ON generation_job (status);

-- ============================================================
-- 题目（独立于试卷存在，这是题库沉淀与错题重刷的基础）
-- ============================================================
CREATE TABLE question (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id           INTEGER,
    type             TEXT    NOT NULL,
    difficulty       TEXT    NOT NULL,
    stem             TEXT    NOT NULL,
    stem_hash        TEXT,
    options_json     TEXT,
    correct_answer   TEXT,
    accepted_answers TEXT,
    reference_answer TEXT,
    rubric_json      TEXT,
    full_score       INTEGER NOT NULL DEFAULT 10,
    explanation      TEXT,
    status           TEXT    NOT NULL DEFAULT 'DRAFT',
    edited_by_user   INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_question_job ON question (job_id);
CREATE INDEX idx_question_hash ON question (stem_hash);
CREATE INDEX idx_question_type_diff ON question (type, difficulty);
CREATE INDEX idx_question_status ON question (status);

CREATE TABLE question_tag (
    question_id INTEGER NOT NULL,
    tag_id      INTEGER NOT NULL,
    PRIMARY KEY (question_id, tag_id)
);
CREATE INDEX idx_question_tag_tag ON question_tag (tag_id, question_id);

-- ============================================================
-- 试卷
-- ============================================================
CREATE TABLE exam (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    name                     TEXT    NOT NULL,
    source                   TEXT    NOT NULL DEFAULT 'GENERATED',
    job_id                   INTEGER,
    origin_exam_id           INTEGER,
    status                   TEXT    NOT NULL DEFAULT 'NOT_STARTED',
    time_limit_min           INTEGER,
    question_count           INTEGER NOT NULL DEFAULT 0,
    full_score               INTEGER NOT NULL DEFAULT 0,
    total_score              NUMERIC,
    score_rate               NUMERIC,
    grading_model_profile_id INTEGER,
    started_at               TEXT,
    submitted_at             TEXT,
    duration_sec             INTEGER,
    created_at               TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_exam_status ON exam (status);
CREATE INDEX idx_exam_submitted ON exam (submitted_at);
CREATE INDEX idx_exam_origin ON exam (origin_exam_id);

CREATE TABLE exam_question (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id     INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    seq         INTEGER NOT NULL,
    UNIQUE (exam_id, question_id)
);
CREATE INDEX idx_exam_question_seq ON exam_question (exam_id, seq);

CREATE TABLE answer (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id     INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    content     TEXT,
    flagged     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (exam_id, question_id)
);

-- ============================================================
-- 阅卷（阅卷历史的载体）
-- ============================================================
CREATE TABLE grading (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id           INTEGER NOT NULL,
    model_profile_id  INTEGER,
    model_snapshot    TEXT,
    status            TEXT    NOT NULL DEFAULT 'RUNNING',
    total_score       NUMERIC NOT NULL DEFAULT 0,
    full_score        INTEGER NOT NULL DEFAULT 0,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost_ms           INTEGER NOT NULL DEFAULT 0,
    error_msg         TEXT,
    created_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_grading_exam ON grading (exam_id);
CREATE INDEX idx_grading_created ON grading (created_at);

CREATE TABLE question_grading (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    grading_id         INTEGER NOT NULL,
    question_id        INTEGER NOT NULL,
    score              NUMERIC NOT NULL DEFAULT 0,
    full_score         INTEGER NOT NULL DEFAULT 0,
    rubric_result_json TEXT,
    comment            TEXT,
    graded_by          TEXT    NOT NULL DEFAULT 'LOCAL',
    manual_override    INTEGER NOT NULL DEFAULT 0,
    override_reason    TEXT,
    error_msg          TEXT,
    created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (grading_id, question_id)
);
CREATE INDEX idx_question_grading_question ON question_grading (question_id);

-- ============================================================
-- 错题本
-- ============================================================
CREATE TABLE wrong_question (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id     INTEGER NOT NULL,
    wrong_count     INTEGER NOT NULL DEFAULT 1,
    pass_streak     INTEGER NOT NULL DEFAULT 0,
    last_score_rate NUMERIC,
    last_wrong_at   TEXT,
    status          TEXT    NOT NULL DEFAULT 'ACTIVE',
    manual_added    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (question_id)
);
CREATE INDEX idx_wrong_question_status ON wrong_question (status);
