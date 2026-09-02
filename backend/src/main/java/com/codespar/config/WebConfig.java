package com.codespar.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 前端是 SPA（React Router），刷新 /exams/1/take 这类深层路径时后端必须回吐 index.html，
 * 否则会 404。这里把非 /api、非静态资源的路径统一 forward 到 index.html。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // 一级到三级路径的 SPA fallback，覆盖 /models、/exams/1/take 这类
        registry.addViewController("/{path:^(?!api|assets|static)[^\\.]*}")
                .setViewName("forward:/index.html");
        registry.addViewController("/{path:^(?!api|assets|static)[^\\.]*}/{sub:[^\\.]*}")
                .setViewName("forward:/index.html");
        registry.addViewController("/{path:^(?!api|assets|static)[^\\.]*}/{sub:[^\\.]*}/{sub2:[^\\.]*}")
                .setViewName("forward:/index.html");
    }
}
