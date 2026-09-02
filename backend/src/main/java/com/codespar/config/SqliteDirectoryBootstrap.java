package com.codespar.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * SQLite 文件不会自动创建父目录。首次启动时若 {@code ~/.codespar} 还不存在
 * （例如全新机器），先建好，保证 Hikari 首连 / Flyway 迁移能成功。
 * <p>配合 {@code initialization-fail-timeout: -1}：首连推迟到本组件初始化之后。
 */
@Slf4j
@Component
public class SqliteDirectoryBootstrap {

    private final String datasourceUrl;

    public SqliteDirectoryBootstrap(@Value("${spring.datasource.url}") String datasourceUrl) {
        this.datasourceUrl = datasourceUrl;
    }

    @PostConstruct
    void ensureDbDirectory() {
        try {
            if (datasourceUrl == null || !datasourceUrl.startsWith("jdbc:sqlite:")) {
                return;
            }
            String filePart = datasourceUrl.substring("jdbc:sqlite:".length());
            int query = filePart.indexOf('?');
            if (query >= 0) {
                filePart = filePart.substring(0, query);
            }
            if (filePart.isBlank() || ":memory:".equals(filePart)) {
                return;
            }
            Path parent = Paths.get(filePart).toAbsolutePath().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
                log.info("已确保 SQLite 目录存在：{}", parent);
            }
        } catch (IOException e) {
            log.warn("创建 SQLite 数据库目录失败，应用可能无法启动：{}", e.getMessage());
        }
    }
}
