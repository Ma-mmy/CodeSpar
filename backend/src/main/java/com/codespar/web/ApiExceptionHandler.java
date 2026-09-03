package com.codespar.web;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 统一错误响应，形如 {@code {"message": "...", "fields": {...}}}。
 * 前端 api/client.ts 会读 message 字段。
 */
@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler {

    /** 业务规则错误，如"名称已存在"。 */
    public static class BizException extends RuntimeException {
        public BizException(String message) {
            super(message);
        }
    }

    @ExceptionHandler(BizException.class)
    public ResponseEntity<Map<String, Object>> handleBiz(BizException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException e) {
        Map<String, String> fields = e.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        f -> f.getDefaultMessage() == null ? "参数不合法" : f.getDefaultMessage(),
                        (a, b) -> a));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", fields.values().stream().findFirst().orElse("参数校验失败"));
        body.put("fields", fields);
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("message", String.valueOf(e.getMessage())));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> handleDataAccess(DataAccessException e) {
        log.error("数据库访问异常", e);
        String raw = e.getMostSpecificCause() == null
                ? String.valueOf(e.getMessage())
                : String.valueOf(e.getMostSpecificCause().getMessage());
        String message;
        if (raw != null && (raw.contains("SQLITE_BUSY") || raw.contains("database is locked"))) {
            message = "数据库正忙（可能刚写出题结果），请稍候再点一次「确认组卷」";
        } else {
            message = "数据库错误：" + truncate(raw, 240);
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", message));
    }

    /** 缺失静态文件（如文章 Markdown 里的相对图片）是 404，不要记成未处理异常。 */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Void> handleNoResource(NoResourceFoundException e) {
        log.debug("静态资源不存在: {}", e.getResourcePath());
        return ResponseEntity.notFound().build();
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception e) {
        log.error("未处理的异常", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "服务器内部错误：" + e.getClass().getSimpleName()));
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }
}
