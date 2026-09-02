package com.codespar.web;

import com.codespar.ai.GenerationEventHub;
import com.codespar.model.dto.GenerationDTO.BatchResultView;
import com.codespar.model.dto.GenerationDTO.ConfirmResult;
import com.codespar.model.dto.GenerationDTO.GenerateRequest;
import com.codespar.model.dto.GenerationDTO.GenerationView;
import com.codespar.model.dto.GenerationDTO.OptimizeRequest;
import com.codespar.model.dto.GenerationDTO.OptimizeResult;
import com.codespar.model.dto.GenerationDTO.QuestionView;
import com.codespar.model.dto.GenerationDTO.RegenerateRequest;
import com.codespar.model.entity.GenerationJob;
import com.codespar.model.enums.QuestionType;
import com.codespar.service.GenerationService;
import com.codespar.service.QuestionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 出题（P3）。
 * <p>创建任务立即返回 jobId，进度经 {@code /generations/{id}/stream} 以 SSE 推送。
 * 断线不影响后台任务 —— 重连时先重放 DB 快照再续接实时事件。
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class GenerationController {

    private final GenerationService service;
    private final GenerationEventHub hub;
    private final QuestionService questionService;

    @PostMapping("/generations")
    public Map<String, Object> create(@Valid @RequestBody GenerateRequest req) {
        return Map.of("id", service.create(req));
    }

    /** 仅优化出题描述，回填表单用；不创建出题任务。 */
    @PostMapping("/generations/optimize")
    public OptimizeResult optimize(@Valid @RequestBody OptimizeRequest req) {
        return service.optimizeOnly(req);
    }

    @GetMapping("/generations")
    public List<GenerationView> list() {
        return service.list();
    }

    @GetMapping("/generations/{id}")
    public GenerationView detail(@PathVariable Long id) {
        return service.detail(id);
    }

    @GetMapping(value = "/generations/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Map<String, Object>>> stream(@PathVariable Long id) {
        GenerationJob job = service.getRequired(id);
        if (service.isTerminal(job.getStatus())) {
            return Flux.fromIterable(terminalEvents(job));
        }
        // 快照重放 + 续接实时事件
        Sinks.Many<ServerSentEvent<Map<String, Object>>> sink = hub.sink(id);
        // 双检：select 之后、订阅之前任务可能刚好完成
        GenerationJob latest = service.getRequired(id);
        if (service.isTerminal(latest.getStatus())) {
            hub.remove(id);
            return Flux.fromIterable(terminalEvents(latest));
        }
        List<ServerSentEvent<Map<String, Object>>> replay = new ArrayList<>();
        replay.add(ServerSentEvent.builder(service.progressPayload(job)).event("progress").build());
        return Flux.concat(Flux.fromIterable(replay), sink.asFlux());
    }

    private static List<ServerSentEvent<Map<String, Object>>> terminalEvents(GenerationJob job) {
        List<ServerSentEvent<Map<String, Object>>> events = new ArrayList<>();
        events.add(ServerSentEvent.builder(jobProgress(job)).event("progress").build());
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("status", job.getStatus());
        done.put("generated", job.getGeneratedCount());
        done.put("errorMsg", job.getErrorMsg() == null ? "" : job.getErrorMsg());
        events.add(ServerSentEvent.builder(done).event("done").build());
        return events;
    }

    private static Map<String, Object> jobProgress(GenerationJob job) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("generated", job.getGeneratedCount());
        m.put("requested", job.getRequestedCount());
        m.put("promptTokens", job.getPromptTokens());
        m.put("completionTokens", job.getCompletionTokens());
        m.put("costMs", job.getCostMs());
        return m;
    }

    @PostMapping("/generations/{id}/cancel")
    public ResponseEntity<Void> cancel(@PathVariable Long id) {
        service.cancel(id);
        return ResponseEntity.noContent().build();
    }

    /** 删除出题历史（未入卷题目一并删；已组进试卷的题目保留）。 */
    @DeleteMapping("/generations/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 相同参数再来一次（自动带去重）。 */
    @PostMapping("/generations/{id}/rerun")
    public Map<String, Object> rerun(@PathVariable Long id) {
        return Map.of("id", service.rerun(id));
    }

    @GetMapping("/generations/{id}/questions")
    public List<QuestionView> questions(@PathVariable Long id) {
        return service.questions(id);
    }

    @GetMapping("/generations/{id}/batches")
    public List<BatchResultView> batches(@PathVariable Long id) {
        return service.batches(id);
    }

    /** 重试某个失败的题型批次（补生成缺的题）。 */
    @PostMapping("/generations/{id}/batches/{type}/retry")
    public ResponseEntity<Void> retryBatch(@PathVariable Long id, @PathVariable QuestionType type) {
        service.retryBatch(id, type);
        return ResponseEntity.noContent().build();
    }

    /** 确认组卷：DRAFT → ACTIVE，创建 Exam。 */
    @PostMapping("/generations/{id}/confirm")
    public ConfirmResult confirm(@PathVariable Long id) {
        return ConfirmResult.of(service.confirm(id));
    }

    /** 单题重生成（可带修改意见）。 */
    @PostMapping("/questions/{id}/regenerate")
    public QuestionView regenerate(@PathVariable Long id,
                                   @RequestBody(required = false) RegenerateRequest req) {
        return questionService.regenerate(id, req == null ? null : req.getFeedback());
    }

    /** 删除 DRAFT 题目（预览页弃题）。 */
    @DeleteMapping("/questions/{id}")
    public ResponseEntity<Void> deleteQuestion(@PathVariable Long id) {
        questionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
