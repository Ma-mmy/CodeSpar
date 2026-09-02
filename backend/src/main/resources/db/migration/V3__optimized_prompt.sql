-- 出题前经提示词工程优化后的最终指令（用户原文仍保存在 prompt）
ALTER TABLE generation_job ADD COLUMN optimized_prompt TEXT;
