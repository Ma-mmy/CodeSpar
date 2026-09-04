package com.codespar.config;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;

/** 可跨进程重启校验的加密解锁 Cookie。口令变更后，旧 Cookie 自动失效。 */
@Component
public class AccessSessions {

    static final String COOKIE_NAME = "CODESPAR_SID";
    private static final String TOKEN_VERSION = "v1";

    private final AccessPasswordStore store;
    private final CryptoService cryptoService;
    private final Duration duration;
    private final boolean secure;
    private final Clock clock;

    @Autowired
    public AccessSessions(
            AccessPasswordStore store,
            CryptoService cryptoService,
            @Value("${codespar.access.session-duration:7d}") Duration duration,
            @Value("${codespar.public-origin:}") String publicOrigin) {
        this(store, cryptoService, duration, publicOrigin, Clock.systemUTC());
    }

    AccessSessions(
            AccessPasswordStore store,
            CryptoService cryptoService,
            Duration duration,
            String publicOrigin,
            Clock clock) {
        if (duration.isZero() || duration.isNegative()) {
            throw new IllegalArgumentException("访问口令会话有效期必须大于 0");
        }
        this.store = store;
        this.cryptoService = cryptoService;
        this.duration = duration;
        this.secure = publicOrigin != null
                && publicOrigin.trim().toLowerCase(Locale.ROOT).startsWith("https:");
        this.clock = clock;
    }

    public boolean isUnlocked(HttpServletRequest request) {
        if (!store.isEnabled()) {
            return true;
        }
        String token = cookieValue(request);
        if (token == null || token.isBlank()) {
            return false;
        }
        try {
            String payload = cryptoService.decrypt(fromCookieValue(token));
            String[] parts = payload.split(":", 3);
            if (parts.length != 3 || !TOKEN_VERSION.equals(parts[0])) {
                return false;
            }
            long expiresAt = Long.parseLong(parts[1]);
            if (clock.instant().getEpochSecond() >= expiresAt) {
                return false;
            }
            return MessageDigest.isEqual(
                    parts[2].getBytes(StandardCharsets.UTF_8),
                    store.credentialFingerprint().getBytes(StandardCharsets.UTF_8));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return false;
        }
    }

    public void grant(HttpServletRequest request, HttpServletResponse response) {
        long expiresAt = clock.instant().plus(duration).getEpochSecond();
        String payload = TOKEN_VERSION + ":" + expiresAt + ":" + store.credentialFingerprint();
        addCookie(request, response, toCookieValue(cryptoService.encrypt(payload)), maxAgeSeconds());
    }

    public void revoke(HttpServletRequest request, HttpServletResponse response) {
        addCookie(request, response, "", 0);
    }

    private String cookieValue(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private void addCookie(
            HttpServletRequest request,
            HttpServletResponse response,
            String value,
            int maxAgeSeconds) {
        Cookie cookie = new Cookie(COOKIE_NAME, value);
        cookie.setHttpOnly(true);
        cookie.setSecure(secure || request.isSecure());
        cookie.setPath("/");
        cookie.setMaxAge(maxAgeSeconds);
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);
    }

    private int maxAgeSeconds() {
        return Math.toIntExact(duration.toSeconds());
    }

    private static String toCookieValue(String encrypted) {
        byte[] bytes = Base64.getDecoder().decode(encrypted);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String fromCookieValue(String cookieValue) {
        byte[] bytes = Base64.getUrlDecoder().decode(cookieValue);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
