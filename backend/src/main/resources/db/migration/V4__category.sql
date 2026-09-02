-- 卷级 / 出题任务级主分类（粗粒度，用于列表筛选）
ALTER TABLE generation_job ADD COLUMN category TEXT;
ALTER TABLE exam ADD COLUMN category TEXT;
CREATE INDEX idx_generation_job_category ON generation_job (category);
CREATE INDEX idx_exam_category ON exam (category);
