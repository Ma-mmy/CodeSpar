package com.codespar.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查。start.sh 轮询这个接口判断服务是否就绪。
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    private final JdbcTemplate jdbcTemplate;

    @Value("${spring.application.name}")
    private String appName;

    public HealthController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("app", appName);
        result.put("status", "UP");
        try {
            // SQLite 专用：sqlite_master 是系统表，排除系统内部表后统计业务表
            String version = jdbcTemplate.queryForObject("SELECT sqlite_version()", String.class);
            Integer tables = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                    Integer.class);
            result.put("db", version);
            result.put("tables", tables);
        } catch (Exception e) {
            result.put("status", "DEGRADED");
            result.put("dbError", e.getMessage());
        }
        return result;
    }
}
