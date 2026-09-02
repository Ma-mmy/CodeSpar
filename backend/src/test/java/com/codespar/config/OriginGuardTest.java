package com.codespar.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OriginGuardTest {

    @Test
    void missingOriginAndRefererAllowed() {
        assertTrue(OriginGuard.allowed(null, null, ""));
        assertTrue(OriginGuard.allowed(" ", "", null));
    }

    @Test
    void localhostAllowedWhenPublicOriginUnset() {
        assertTrue(OriginGuard.allowed("http://localhost:5173", null, ""));
        assertTrue(OriginGuard.allowed("http://127.0.0.1:8099", null, null));
        assertTrue(OriginGuard.allowed(null, "http://localhost:5173/generate", ""));
        assertFalse(OriginGuard.allowed("https://evil.example", null, ""));
    }

    @Test
    void sameHostAsRequestAllowedWithoutPublicOrigin() {
        assertTrue(OriginGuard.allowed(
                "http://codespar.mmy.qd.je", null, "", "http", "codespar.mmy.qd.je"));
        assertTrue(OriginGuard.allowed(
                "http://codespar.mmy.qd.je", null, "", "http", "codespar.mmy.qd.je:80"));
        assertFalse(OriginGuard.allowed(
                "https://evil.example", null, "", "http", "codespar.mmy.qd.je"));
    }

    @Test
    void publicOriginMustMatchExactly() {
        String pub = "https://exam.example.com";
        assertTrue(OriginGuard.allowed("https://exam.example.com", null, pub));
        assertTrue(OriginGuard.allowed("https://exam.example.com/", "https://exam.example.com/exams", pub));
        assertFalse(OriginGuard.allowed("https://evil.example.com", null, pub));
        assertFalse(OriginGuard.allowed("http://exam.example.com", null, pub));
        assertFalse(OriginGuard.allowed("http://localhost:5173", null, pub));
    }

    @Test
    void refererFallsBackWhenOriginAbsent() {
        assertTrue(OriginGuard.allowed(null, "https://exam.example.com/settings", "https://exam.example.com"));
        assertFalse(OriginGuard.allowed(null, "https://other.example/x", "https://exam.example.com"));
    }
}
