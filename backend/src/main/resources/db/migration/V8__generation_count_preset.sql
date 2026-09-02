-- 出题页「题型与数量」的可保存预设（单行，与提示词预设分开）
CREATE TABLE generation_count_preset (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    counts_json TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
