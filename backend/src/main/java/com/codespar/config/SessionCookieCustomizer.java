package com.codespar.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.server.ConfigurableServletWebServerFactory;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * 公网 HTTPS 下把会话 Cookie 标成 Secure。本机 HTTP 开发不标，否则浏览器不存 Cookie。
 */
@Component
public class SessionCookieCustomizer implements WebServerFactoryCustomizer<ConfigurableServletWebServerFactory> {

    private final boolean secure;

    public SessionCookieCustomizer(@Value("${codespar.public-origin:}") String publicOrigin) {
        this.secure = publicOrigin != null
                && publicOrigin.trim().toLowerCase(Locale.ROOT).startsWith("https:");
    }

    @Override
    public void customize(ConfigurableServletWebServerFactory factory) {
        factory.addInitializers(ctx -> ctx.getSessionCookieConfig().setSecure(secure));
    }
}
