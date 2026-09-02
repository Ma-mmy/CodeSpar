package com.codespar.web;

import com.codespar.model.dto.ExamDTO.ExamDetail;
import com.codespar.model.dto.WrongQuestionDTO.AddRequest;
import com.codespar.model.dto.WrongQuestionDTO.ComposeRequest;
import com.codespar.model.dto.WrongQuestionDTO.Item;
import com.codespar.model.dto.WrongQuestionDTO.ListView;
import com.codespar.service.WrongQuestionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 错题本。 */
@RestController
@RequestMapping("/api/wrong-questions")
@RequiredArgsConstructor
public class WrongQuestionController {

    private final WrongQuestionService service;

    @GetMapping
    public ListView list(@RequestParam(value = "status", required = false) String status,
                         @RequestParam(value = "tag", required = false) String tag) {
        return service.list(status, tag);
    }

    @PostMapping
    public Item add(@Valid @RequestBody AddRequest req) {
        return service.add(req.getQuestionId());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> remove(@PathVariable Long id) {
        service.remove(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/question/{questionId}")
    public ResponseEntity<Void> removeByQuestion(@PathVariable Long questionId) {
        service.removeByQuestion(questionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/compose")
    public ExamDetail compose(@RequestBody(required = false) ComposeRequest req) {
        return service.compose(req);
    }
}
