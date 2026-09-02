package com.codespar.web;

import com.codespar.model.dto.ModelProfileDTO;
import com.codespar.service.ModelProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/models")
@RequiredArgsConstructor
public class ModelProfileController {

    private final ModelProfileService service;

    @GetMapping
    public List<ModelProfileDTO.View> list() {
        return service.list();
    }

    @PostMapping
    public ModelProfileDTO.View create(@Valid @RequestBody ModelProfileDTO.Upsert req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public ModelProfileDTO.View update(@PathVariable Long id,
                                       @Valid @RequestBody ModelProfileDTO.Upsert req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 设为默认出题 / 阅卷模型。role 取 generate 或 grade。 */
    @PostMapping("/{id}/default/{role}")
    public ResponseEntity<Void> setDefault(@PathVariable Long id, @PathVariable String role) {
        boolean forGenerate = switch (role) {
            case "generate" -> true;
            case "grade" -> false;
            default -> throw new IllegalArgumentException("role 只能是 generate 或 grade");
        };
        service.setDefault(id, forGenerate);
        return ResponseEntity.noContent().build();
    }

    /** 测已保存的配置。 */
    @PostMapping("/{id}/test")
    public ModelProfileDTO.TestResult test(@PathVariable Long id) {
        return service.test(id);
    }

    /** 测尚未保存的表单内容。 */
    @PostMapping("/test")
    public ModelProfileDTO.TestResult testDraft(@Valid @RequestBody ModelProfileDTO.TestRequest req) {
        return service.testDraft(req);
    }
}
