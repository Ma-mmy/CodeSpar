ALTER TABLE article ADD COLUMN source_path TEXT;
CREATE UNIQUE INDEX idx_article_source_path ON article (source_path) WHERE source_path IS NOT NULL;
ALTER TABLE article_folder ADD COLUMN source_path TEXT;
CREATE UNIQUE INDEX idx_article_folder_source_path ON article_folder (source_path) WHERE source_path IS NOT NULL;
