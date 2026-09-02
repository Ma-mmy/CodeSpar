-- CodeSpar V2：出题批次（每题型一条记录，支撑失败重试与逐批进度展示）
CREATE TABLE generation_batch (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id           INTEGER NOT NULL,
    batch_type       TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'PENDING',
    requested_count  INTEGER NOT NULL DEFAULT 0,
    generated_count  INTEGER NOT NULL DEFAULT 0,
    error_msg        TEXT,
    raw_output       TEXT,
    created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_id, batch_type)
);
