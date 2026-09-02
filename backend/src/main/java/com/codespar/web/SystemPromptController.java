package com.codespar.web;

import com.codespar.model.dto.SystemPromptDTO.PromptMeta;
import com.codespar.model.dto.SystemPromptDTO.ResetRequest;
import com.codespar.model.dto.SystemPromptDTO.SaveRequest;
import com.codespar.service.SystemPromptService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/settings/prompts")
@RequiredArgsConstructor
public class SystemPromptController {

    private final SystemPromptService service;

    @GetMapping
    public List<PromptMeta> list() {
        return service.list();
    }

    @GetMapping("/{key}")
    public PromptMeta get(@PathVariable String key) {
        return service.get(key);
    }

    @PutMapping
    public PromptMeta save(@Valid @RequestBody SaveRequest req) {
        return service.save(req);
    }

    @PostMapping("/reset")
    public PromptMeta reset(@Valid @RequestBody ResetRequest req) {
        return service.reset(req);
    }
}
