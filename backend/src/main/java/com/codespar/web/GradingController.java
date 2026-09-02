package com.codespar.web;

import com.codespar.ai.GradingEventHub;
import com.codespar.model.dto.GradingDTO;
import com.codespar.model.dto.GradingDTO.OverrideRequest;
import com.codespar.model.dto.GradingDTO.QuestionReport;
import com.codespar.model.dto.GradingDTO.ReportView;
import com.codespar.model.entity.Grading;
import com.codespar.service.GradingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
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
 * 阅卷（P5）。
 * <p>交卷后由 ExamController 触发；进度经 {@code /gradings/{id}/stream} SSE 推送。
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class GradingController {

    private final GradingService service;
    private final GradingEventHub hub;

    @GetMapping("/gradings/{id}")
    public GradingDTO.GradingView detail(@PathVariable Long id) {
        return service.detail(id);
    }

    @GetMapping(value = "/gradings/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Map<String, Object>>> stream(@PathVariable Long id) {
        Grading grading = service.getRequired(id);
        if (service.isTerminal(grading.getStatus())) {
            return Flux.fromIterable(terminalEvents(grading));
        }
        Sinks.Many<ServerSentEvent<Map<String, Object>>> sink = hub.sink(id);
        Grading latest = service.getRequired(id);
        if (service.isTerminal(latest.getStatus())) {
            hub.remove(id);
            return Flux.fromIterable(terminalEvents(latest));
        }
        List<ServerSentEvent<Map<String, Object>>> replay = new ArrayList<>();
        replay.add(ServerSentEvent.builder(service.progressPayload(grading)).event("progress").build());
        return Flux.concat(Flux.fromIterable(replay), sink.asFlux());
    }

    private List<ServerSentEvent<Map<String, Object>>> terminalEvents(Grading grading) {
        List<ServerSentEvent<Map<String, Object>>> events = new ArrayList<>();
        events.add(ServerSentEvent.builder(service.progressPayload(grading)).event("progress").build());
        Map<String, Object> done = new LinkedHashMap<>();
        done.put("status", grading.getStatus());
        done.put("totalScore", grading.getTotalScore());
        done.put("fullScore", grading.getFullScore());
        done.put("errorMsg", grading.getErrorMsg() == null ? "" : grading.getErrorMsg());
        events.add(ServerSentEvent.builder(done).event("done").build());
        return events;
    }

    @PostMapping("/gradings/{id}/questions/{qid}/retry")
    public ResponseEntity<Void> retry(@PathVariable Long id, @PathVariable("qid") Long questionId) {
        service.retryQuestion(id, questionId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/gradings/{id}/questions/{qid}")
    public QuestionReport overrideScore(@PathVariable Long id,
                                        @PathVariable("qid") Long questionId,
                                        @Valid @RequestBody OverrideRequest req) {
        return service.overrideScore(id, questionId, req);
    }

    /** 成绩报告（按试卷）。 */
    @GetMapping("/exams/{examId}/report")
    public ReportView report(@PathVariable Long examId) {
        return service.buildReport(examId);
    }

    /** 对已交卷但尚未阅卷 / 需重跑的试卷手动启动阅卷。 */
    @PostMapping("/exams/{examId}/grade")
    public Map<String, Object> startGrade(@PathVariable Long examId,
                                          @RequestBody(required = false) GradingDTO.SubmitRequest req) {
        Long modelId = req == null ? null : req.getGradingModelId();
        return Map.of("gradingId", service.startGrading(examId, modelId));
    }
}
