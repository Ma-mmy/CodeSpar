package com.codespar.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class LoginRateLimiterTest {

    @Test
    void blocksAfterMaxFailuresAndClearsOnSuccess() {
        LoginRateLimiter limiter = new LoginRateLimiter(3, 600);
        String ip = "203.0.113.8";

        assertFalse(limiter.isBlocked(ip));
        limiter.recordFailure(ip);
        limiter.recordFailure(ip);
        assertFalse(limiter.isBlocked(ip));
        limiter.recordFailure(ip);
        assertTrue(limiter.isBlocked(ip));

        limiter.recordSuccess(ip);
        assertFalse(limiter.isBlocked(ip));
    }

    @Test
    void differentIpsAreIndependent() {
        LoginRateLimiter limiter = new LoginRateLimiter(1, 600);
        limiter.recordFailure("10.0.0.1");
        assertTrue(limiter.isBlocked("10.0.0.1"));
        assertFalse(limiter.isBlocked("10.0.0.2"));
    }
}
