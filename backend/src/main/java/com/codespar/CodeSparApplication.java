package com.codespar;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * CodeSpar —— 面向 Agent 工程师的 LLM 驱动模考与复盘系统。
 *
 * <p>注意：本应用刻意<b>不</b>使用 Spring AI 的 ChatModel 自动配置。
 * 模型配置存在数据库里、由用户在 UI 上随时增删，因此 ChatModel 必须在运行时按需构造，
 * 详见 {@code com.codespar.ai.ChatModelFactory}。
 */
@SpringBootApplication
@MapperScan("com.codespar.mapper")
public class CodeSparApplication {

    public static void main(String[] args) {
        SpringApplication.run(CodeSparApplication.class, args);
    }
}
