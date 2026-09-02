-- 系统提示词槽位覆盖（主模板仍内置；用户只改可编辑槽位）
CREATE TABLE system_prompt_override (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_key TEXT    NOT NULL,
    slot_key   TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uk_system_prompt_override ON system_prompt_override (prompt_key, slot_key);
