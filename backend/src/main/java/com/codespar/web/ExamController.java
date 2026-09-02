package com.codespar.web;

import com.codespar.model.dto.ExamDTO.AnswerView;
import com.codespar.model.dto.ExamDTO.ExamDetail;
import com.codespar.model.dto.ExamDTO.ExamListItem;
import com.codespar.model.dto.ExamDTO.SaveAnswerRequest;
import com.codespar.model.dto.ExamDTO.StartRequest;
import com.codespar.model.dto.ExamDTO.SubmitRequest;
import com.codespar.model.dto.ExamDTO.SubmitResult;
import com.codespar.service.ExamService;
import com.codespar.service.GradingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 模考答题（P4）。交卷后触发阅卷（P5）。
 */
@RestController
@RequestMapping("/api/exams")
@RequiredArgsConstructor
public class ExamController {

    private final ExamService service;
    private final GradingService gradingService;

    @GetMapping
    public List<ExamListItem> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public ExamDetail detail(@PathVariable Long id) {
        return service.getForTaking(id);
    }

    @GetMapping("/{id}/answers")
    public List<AnswerView> answers(@PathVariable Long id) {
        return service.listAnswers(id);
    }

    @PostMapping("/{id}/start")
    public ExamDetail start(@PathVariable Long id, @RequestBody(required = false) StartRequest req) {
        return service.start(id, req);
    }

    @PutMapping("/{id}/answers/{qid}")
    public AnswerView saveAnswer(@PathVariable Long id,
                                 @PathVariable("qid") Long questionId,
                                 @RequestBody SaveAnswerRequest req) {
        return service.saveAnswer(id, questionId, req);
    }

    @PostMapping("/{id}/submit")
    public SubmitResult submit(@PathVariable Long id,
                               @RequestBody(required = false) SubmitRequest req) {
        Long modelId = req == null ? null : req.getGradingModelId();
        SubmitResult result = service.submit(id, modelId);
        // 事务已提交后再启动阅卷，保证异步线程能读到 SUBMITTED
        result.setGradingId(gradingService.startGrading(id, modelId));
        return result;
    }

    /** 重刷此卷：同题新卷，零成本。 */
    @PostMapping("/{id}/retake")
    public ExamDetail retake(@PathVariable Long id) {
        return service.retake(id);
    }

    /** 清空答题记录：擦除作答与阅卷，回到未开始。 */
    @PostMapping("/{id}/clear-answers")
    public ExamDetail clearAnswers(@PathVariable Long id) {
        return service.clearAnswers(id);
    }

    /** 删除试卷（作答/阅卷一并删，题目保留）。 */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
