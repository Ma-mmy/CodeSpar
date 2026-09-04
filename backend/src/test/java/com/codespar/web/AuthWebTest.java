package com.codespar.web;

import com.codespar.config.AccessControlFilter;
import com.codespar.config.AccessPasswordStore;
import com.codespar.config.AccessSessions;
import com.codespar.config.CryptoService;
import com.codespar.config.LoginRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockCookie;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.time.Duration;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthWebTest {

    MockMvc mvc;
    AccessPasswordStore store;
    LoginRateLimiter rateLimiter;
    AccessSessions sessions;

    @BeforeEach
    void setup() {
        store = mock(AccessPasswordStore.class);
        when(store.isEnabled()).thenReturn(true);
        when(store.isManagedByConfig()).thenReturn(true);
        when(store.generation()).thenReturn(1);
        when(store.matches(anyString())).thenReturn(false);
        when(store.matches("test-pass-1")).thenReturn(true);

        rateLimiter = new LoginRateLimiter(5, 600);
        CryptoService cryptoService = mock(CryptoService.class);
        when(cryptoService.encrypt(anyString())).thenAnswer(invocation ->
                java.util.Base64.getEncoder().encodeToString(
                        invocation.<String>getArgument(0).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        when(cryptoService.decrypt(anyString())).thenAnswer(invocation ->
                new String(java.util.Base64.getDecoder().decode(invocation.<String>getArgument(0)),
                        java.nio.charset.StandardCharsets.UTF_8));
        when(store.credentialFingerprint()).thenReturn("credential-fingerprint");
        sessions = new AccessSessions(store, cryptoService, Duration.ofDays(7), "");

        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);
        HealthController health = new HealthController(jdbc);
        ReflectionTestUtils.setField(health, "appName", "codespar");

        mvc = MockMvcBuilders.standaloneSetup(
                        new AuthController(store, rateLimiter, sessions),
                        health,
                        new StubModelsController())
                .setControllerAdvice(new ApiExceptionHandler())
                .addFilters(new AccessControlFilter(store, sessions, ""))
                .build();
    }

    @Test
    void healthIsPublicAndOmitsDbDetails() throws Exception {
        mvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.app").value("codespar"))
                .andExpect(jsonPath("$.tables").doesNotExist())
                .andExpect(jsonPath("$.db").doesNotExist())
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void modelsRequireSessionWhenAccessEnabled() throws Exception {
        mvc.perform(get("/api/models"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("未解锁"));
    }

    @Test
    void loginThenModelsSucceeds() throws Exception {
        MvcResult login = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "http://localhost:5173")
                        .content("{\"password\":\"test-pass-1\"}"))
                .andExpect(status().isNoContent())
                .andReturn();

        String token = login.getResponse().getCookie("CODESPAR_SID").getValue();
        mvc.perform(get("/api/models").cookie(new MockCookie("CODESPAR_SID", token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value("true"));
    }

    @Test
    void wrongPasswordIsUnauthorized() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "http://localhost:5173")
                        .content("{\"password\":\"nope\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("口令不正确"));
    }

    @Test
    void foreignOriginOnWriteIsForbidden() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "https://evil.example")
                        .content("{\"password\":\"test-pass-1\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("请求来源不被允许"));
    }

    @Test
    void statusIsPublic() throws Exception {
        mvc.perform(get("/api/auth/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.unlocked").value(false))
                .andExpect(jsonPath("$.managedByConfig").value(true));
    }

    @Test
    void disabledAccessSkipsGate() throws Exception {
        when(store.isEnabled()).thenReturn(false);
        mvc.perform(get("/api/models"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value("true"));
    }

    @Test
    void loginRateLimitedAfterRepeatedFailures() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .header("Origin", "http://localhost:5173")
                            .content("{\"password\":\"nope\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "http://localhost:5173")
                        .content("{\"password\":\"test-pass-1\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value("尝试次数过多，请稍后再试"));
    }

    @RestController
    @RequestMapping("/api/models")
    static class StubModelsController {
        @GetMapping
        Map<String, String> list() {
            return Map.of("ok", "true");
        }
    }
}
