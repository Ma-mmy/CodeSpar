package com.codespar.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 出题/阅卷任务的线程池。虚拟线程对"并发等 LLM 响应"这种 IO 密集场景是天然收益。
 * <p>任务独立于请求生命周期运行 —— SSE 断线不影响后台生成。
 */
@Configuration
public class AsyncConfig {

    @Bean(destroyMethod = "close")
    public ExecutorService generationExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
