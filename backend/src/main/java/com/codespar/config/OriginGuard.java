package com.codespar.config;

import java.net.URI;
import java.util.Locale;

/**
 * 写操作的 Origin / Referer 校验。Cookie 已是 SameSite=Lax，这是防跨站 POST 的纵深。
 * 无 Origin、无 Referer 的请求（curl / 脚本）放行。
 */
final class OriginGuard {

    private OriginGuard() {}

    static boolean allowed(
            String originHeader,
            String refererHeader,
            String publicOrigin,
            String requestScheme,
            String requestHost) {
        String candidate = blankToNull(originHeader);
        if (candidate == null) {
            candidate = originFromReferer(refererHeader);
        }
        if (candidate == null) {
            return true;
        }
        String actual = normalizeOrigin(candidate);
        if (actual == null) {
            return false;
        }
        String configured = blankToNull(publicOrigin);
        if (configured != null) {
            String expected = normalizeOrigin(configured);
            return expected != null && expected.equals(actual);
        }
        String self = originFromRequest(requestScheme, requestHost);
        if (self != null && self.equals(actual)) {
            return true;
        }
        return isLoopbackOrigin(candidate);
    }

    static boolean allowed(String originHeader, String refererHeader, String publicOrigin) {
        return allowed(originHeader, refererHeader, publicOrigin, null, null);
    }

    static boolean isLoopbackOrigin(String origin) {
        try {
            URI uri = URI.create(origin.trim());
            String host = uri.getHost();
            if (host == null) {
                return false;
            }
            String h = host.toLowerCase(Locale.ROOT);
            if (h.startsWith("[") && h.endsWith("]")) {
                h = h.substring(1, h.length() - 1);
            }
            return "localhost".equals(h) || "127.0.0.1".equals(h) || "::1".equals(h);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    static String originFromReferer(String referer) {
        if (blankToNull(referer) == null) {
            return null;
        }
        try {
            URI uri = URI.create(referer.trim());
            if (uri.getScheme() == null || uri.getHost() == null) {
                return null;
            }
            return normalizeOrigin(uri.getScheme() + "://" + hostPort(uri));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    static String normalizeOrigin(String origin) {
        try {
            URI uri = URI.create(origin.trim());
            if (uri.getScheme() == null || uri.getHost() == null) {
                return null;
            }
            String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            if (port == -1
                    || ("http".equals(scheme) && port == 80)
                    || ("https".equals(scheme) && port == 443)) {
                return scheme + "://" + host;
            }
            return scheme + "://" + host + ":" + port;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    static String originFromRequest(String scheme, String hostHeader) {
        if (blankToNull(scheme) == null || blankToNull(hostHeader) == null) {
            return null;
        }
        return normalizeOrigin(scheme.trim() + "://" + hostHeader.trim());
    }

    private static String hostPort(URI uri) {
        if (uri.getPort() == -1) {
            return uri.getHost();
        }
        return uri.getHost() + ":" + uri.getPort();
    }

    private static String blankToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
