package com.codespar.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/** HttpSession 上的解锁标记。口令变更会抬 generation，旧会话失效。 */
public final class AccessSessions {

    static final String ATTR_UNLOCKED = "codespar.unlocked";
    static final String ATTR_GEN = "codespar.pwdGen";

    private AccessSessions() {}

    public static boolean isUnlocked(HttpServletRequest request, AccessPasswordStore store) {
        if (!store.isEnabled()) {
            return true;
        }
        HttpSession session = request.getSession(false);
        if (session == null || !Boolean.TRUE.equals(session.getAttribute(ATTR_UNLOCKED))) {
            return false;
        }
        Object gen = session.getAttribute(ATTR_GEN);
        return gen instanceof Integer g && g == store.generation();
    }

    public static void grant(HttpServletRequest request, AccessPasswordStore store) {
        HttpSession session = request.getSession(true);
        session.setAttribute(ATTR_UNLOCKED, Boolean.TRUE);
        session.setAttribute(ATTR_GEN, store.generation());
    }

    public static void refreshGeneration(HttpServletRequest request, AccessPasswordStore store) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.setAttribute(ATTR_GEN, store.generation());
        }
    }

    public static void revoke(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }
}
