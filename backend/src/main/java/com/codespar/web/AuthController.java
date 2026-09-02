package com.codespar.web;

import com.codespar.config.AccessPasswordStore;
import com.codespar.config.AccessSessions;
import com.codespar.config.LoginRateLimiter;
import com.codespar.model.dto.AuthDTO;
import com.codespar.web.ApiExceptionHandler.BizException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AccessPasswordStore store;
    private final LoginRateLimiter rateLimiter;

    @GetMapping("/status")
    public AuthDTO.Status status(HttpServletRequest request) {
        AuthDTO.Status s = new AuthDTO.Status();
        s.setEnabled(store.isEnabled());
        s.setUnlocked(AccessSessions.isUnlocked(request, store));
        s.setManagedByConfig(store.isManagedByConfig());
        return s;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(
            @RequestBody AuthDTO.LoginRequest req,
            HttpServletRequest request) {
        if (!store.isEnabled()) {
            throw new BizException("当前未启用访问口令");
        }
        String ip = clientIp(request);
        if (rateLimiter.isBlocked(ip)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "尝试次数过多，请稍后再试"));
        }
        String password = req == null ? null : req.getPassword();
        if (!store.matches(password)) {
            rateLimiter.recordFailure(ip);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "口令不正确"));
        }
        rateLimiter.recordSuccess(ip);
        AccessSessions.grant(request, store);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        AccessSessions.revoke(request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password")
    public ResponseEntity<Void> changePassword(
            @Valid @RequestBody AuthDTO.ChangePasswordRequest req,
            HttpServletRequest request) {
        store.changePassword(req.getCurrentPassword(), req.getNewPassword());
        AccessSessions.refreshGeneration(request, store);
        return ResponseEntity.noContent().build();
    }

    static String clientIp(HttpServletRequest request) {
        // 反代场景由 server.forward-headers-strategy=framework 改写 remoteAddr；
        // 不要自己读 X-Forwarded-For，否则直连时攻击者能轮换伪造 IP 绕过限流。
        return request.getRemoteAddr();
    }
}
