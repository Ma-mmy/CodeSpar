package com.codespar.web;

import com.codespar.model.dto.PromptPresetDTO.Rename;
import com.codespar.model.dto.PromptPresetDTO.Upsert;
import com.codespar.model.dto.PromptPresetDTO.View;
import com.codespar.service.PromptPresetService;
import jakarta.validation.Valid;
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

/** 出题提示词预设。 */
@RestController
@RequestMapping("/api/presets")
@RequiredArgsConstructor
public class PromptPresetController {

    private final PromptPresetService service;

    @GetMapping
    public List<View> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public View detail(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public View create(@Valid @RequestBody Upsert req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public View update(@PathVariable Long id, @Valid @RequestBody Upsert req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/name")
    public View rename(@PathVariable Long id, @Valid @RequestBody Rename req) {
        return service.rename(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
