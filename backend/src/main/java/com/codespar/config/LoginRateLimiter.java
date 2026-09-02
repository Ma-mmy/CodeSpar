package com.codespar.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** 登录失败按 IP 限流，挡住公网扫口令。 */
@Component
public class LoginRateLimiter {

    private final int maxFailures;
    private final long windowMs;
    private final ConcurrentHashMap<String, Probe> probes = new ConcurrentHashMap<>();

    public LoginRateLimiter(
            @Value("${codespar.access.login-max-failures:5}") int maxFailures,
            @Value("${codespar.access.login-window-sec:600}") long windowSec) {
        this.maxFailures = Math.max(1, maxFailures);
        this.windowMs = Math.max(1, windowSec) * 1000L;
    }

    public boolean isBlocked(String ip) {
        Probe probe = probes.get(normalize(ip));
        if (probe == null) {
            return false;
        }
        if (expired(probe)) {
            probes.remove(normalize(ip), probe);
            return false;
        }
        return probe.failures.get() >= maxFailures;
    }

    public void recordFailure(String ip) {
        pruneIfNeeded();
        String key = normalize(ip);
        long now = System.currentTimeMillis();
        probes.compute(key, (k, old) -> {
            if (old == null || now - old.windowStart > windowMs) {
                return new Probe(now, new AtomicInteger(1));
            }
            old.failures.incrementAndGet();
            return old;
        });
    }

    public void recordSuccess(String ip) {
        probes.remove(normalize(ip));
    }

    public void reset() {
        probes.clear();
    }

    private boolean expired(Probe probe) {
        return System.currentTimeMillis() - probe.windowStart > windowMs;
    }

    private void pruneIfNeeded() {
        if (probes.size() < 256) {
            return;
        }
        long now = System.currentTimeMillis();
        probes.entrySet().removeIf(e -> now - e.getValue().windowStart > windowMs);
    }

    private static String normalize(String ip) {
        return ip == null || ip.isBlank() ? "unknown" : ip.trim();
    }

    private record Probe(long windowStart, AtomicInteger failures) {}
}
