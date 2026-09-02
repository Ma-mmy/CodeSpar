package com.codespar.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Locale;
import java.util.Set;

/**
 * 访问口令门禁 + 安全响应头。静态资源和 SPA 路由保持公开（解锁页是前端路由）；
 * 业务 API 在口令启用时必须带有效会话。SSE 走同源 Cookie，不需要自定义 Header。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class AccessControlFilter extends OncePerRequestFilter {

    private static final Set<String> WRITE_METHODS = Set.of(
            HttpMethod.POST.name(), HttpMethod.PUT.name(),
            HttpMethod.PATCH.name(), HttpMethod.DELETE.name());

    private final AccessPasswordStore store;
    private final String publicOrigin;

    public AccessControlFilter(
            AccessPasswordStore store,
            @Value("${codespar.public-origin:}") String publicOrigin) {
        this.store = store;
        this.publicOrigin = publicOrigin == null ? "" : publicOrigin.trim();
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        addSecurityHeaders(request, response);

        if (!store.isEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        String path = request.getRequestURI();
        if (!isApi(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (WRITE_METHODS.contains(request.getMethod().toUpperCase(Locale.ROOT))
                && !OriginGuard.allowed(
                        request.getHeader("Origin"),
                        request.getHeader("Referer"),
                        publicOrigin,
                        request.getScheme(),
                        request.getHeader("Host"))) {
            writeJson(response, HttpServletResponse.SC_FORBIDDEN, "请求来源不被允许");
            return;
        }

        if (isWhitelisted(request.getMethod(), path)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!AccessSessions.isUnlocked(request, store)) {
            writeJson(response, HttpServletResponse.SC_UNAUTHORIZED, "未解锁");
            return;
        }

        filterChain.doFilter(request, response);
    }

    static boolean isApi(String path) {
        return path != null && path.startsWith("/api/");
    }

    static boolean isWhitelisted(String method, String path) {
        if (path == null) {
            return false;
        }
        String m = method == null ? "" : method.toUpperCase(Locale.ROOT);
        if ("GET".equals(m) && ("/api/health".equals(path) || "/api/auth/status".equals(path))) {
            return true;
        }
        return "POST".equals(m) && "/api/auth/login".equals(path);
    }

    private void addSecurityHeaders(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        response.setHeader("Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                        + "img-src * data: blob:; font-src 'self' data:; connect-src 'self'; "
                        + "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        if (request.isSecure()) {
            response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        }
    }

    private static void writeJson(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
