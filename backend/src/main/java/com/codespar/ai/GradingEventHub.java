package com.codespar.ai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Sinks;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 阅卷进度事件中枢：每个在跑的 grading 对应一个 {@link Sinks.Many}。
 * 行为与 {@link GenerationEventHub} 一致 —— 断线不影响后台任务，重连先拉快照。
 */
@Slf4j
@Component
public class GradingEventHub {

    private final Map<Long, Sinks.Many<ServerSentEvent<Map<String, Object>>>> sinks =
            new ConcurrentHashMap<>();

    public Sinks.Many<ServerSentEvent<Map<String, Object>>> sink(long gradingId) {
        return sinks.computeIfAbsent(gradingId, k -> Sinks.many().multicast().onBackpressureBuffer());
    }

    public void emit(long gradingId, String event, Map<String, Object> data) {
        Sinks.Many<ServerSentEvent<Map<String, Object>>> sink = sinks.get(gradingId);
        if (sink != null) {
            sink.tryEmitNext(ServerSentEvent.builder(data).event(event).build());
        }
    }

    public void complete(long gradingId) {
        Sinks.Many<ServerSentEvent<Map<String, Object>>> sink = sinks.remove(gradingId);
        if (sink != null) {
            sink.tryEmitComplete();
        }
    }

    public void remove(long gradingId) {
        sinks.remove(gradingId);
    }
}
