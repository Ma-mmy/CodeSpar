package com.codespar.web;

import com.codespar.model.dto.CategoryDTO.Upsert;
import com.codespar.model.dto.CategoryDTO.View;
import com.codespar.service.CategoryService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 试卷主分类（设置可管理；出题下拉读启用项）。 */
@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService service;

    /** 出题/筛选：默认只返回启用项；all=true 时返回全部（设置页）。 */
    @GetMapping
    public List<View> list(@RequestParam(value = "all", required = false, defaultValue = "false") boolean all) {
        return all ? service.listAll() : service.listEnabled();
    }

    @PostMapping
    public View create(@Valid @RequestBody Upsert req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public View update(@PathVariable Long id, @Valid @RequestBody Upsert req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
