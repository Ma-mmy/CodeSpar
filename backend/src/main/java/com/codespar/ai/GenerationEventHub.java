package com.codespar.ai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Sinks;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 出题进度事件中枢：每个在跑的 job 对应一个 {@link Sinks.Many} 广播其 SSE 事件。
 *
 * <p>用 replay.limit：前端晚订阅（或断线重连）仍能拿到最近事件，避免「优化已完成 /
 * 某批已出完」在页面上永远看不到。job 结束（complete）时移除并 complete 该 sink。
 */
@Slf4j
@Component
public class GenerationEventHub {

    private static final int REPLAY_LIMIT = 128;

    private final Map<Long, Sinks.Many<ServerSentEvent<Map<String, Object>>>> sinks =
            new ConcurrentHashMap<>();

    public Sinks.Many<ServerSentEvent<Map<String, Object>>> sink(long jobId) {
        return sinks.computeIfAbsent(jobId, k -> Sinks.many().replay().limit(REPLAY_LIMIT));
    }

    /** 发一条事件。sink 不存在（已结束或从未被订阅）时静默丢弃。 */
    public void emit(long jobId, String event, Map<String, Object> data) {
        Sinks.Many<ServerSentEvent<Map<String, Object>>> sink = sinks.get(jobId);
        if (sink != null) {
            sink.tryEmitNext(ServerSentEvent.builder(data).event(event).build());
        }
    }

    /** job 收尾：移除并 complete，通知所有已订阅的流结束。 */
    public void complete(long jobId) {
        Sinks.Many<ServerSentEvent<Map<String, Object>>> sink = sinks.remove(jobId);
        if (sink != null) {
            sink.tryEmitComplete();
        }
    }

    public void remove(long jobId) {
        sinks.remove(jobId);
    }
}
