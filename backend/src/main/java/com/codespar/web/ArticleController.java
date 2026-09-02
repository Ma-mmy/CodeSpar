package com.codespar.web;

import com.codespar.model.dto.ArticleDTO.ArticleDetail;
import com.codespar.model.dto.ArticleDTO.CreateFolderRequest;
import com.codespar.model.dto.ArticleDTO.FolderView;
import com.codespar.model.dto.ArticleDTO.MoveArticleRequest;
import com.codespar.model.dto.ArticleDTO.MoveFolderRequest;
import com.codespar.model.dto.ArticleDTO.OpenContext;
import com.codespar.model.dto.ArticleDTO.RefineRequest;
import com.codespar.model.dto.ArticleDTO.RenameFolderRequest;
import com.codespar.model.dto.ArticleDTO.UpdateSummaryRequest;
import com.codespar.model.dto.ArticleDTO.UpsertArticleRequest;
import com.codespar.model.dto.ExamDTO.ExamListItem;
import com.codespar.service.ArticleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/articles")
@RequiredArgsConstructor
public class ArticleController {

    private final ArticleService service;

    @GetMapping("/tree")
    public FolderView tree() {
        return service.tree();
    }

    @PostMapping("/folders")
    public FolderView createFolder(@Valid @RequestBody CreateFolderRequest req) {
        return service.createFolder(req);
    }

    @PutMapping("/folders/{id}")
    public FolderView renameFolder(@PathVariable Long id, @Valid @RequestBody RenameFolderRequest req) {
        return service.renameFolder(id, req);
    }

    @PostMapping("/folders/{id}/move")
    public FolderView moveFolder(@PathVariable Long id, @RequestBody MoveFolderRequest req) {
        return service.moveFolder(id, req);
    }

    @DeleteMapping("/folders/{id}")
    public ResponseEntity<Void> deleteFolder(@PathVariable Long id) {
        service.deleteFolder(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ArticleDetail create(@Valid @RequestBody UpsertArticleRequest req) {
        return service.create(req);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ArticleDetail upload(@RequestPart("file") MultipartFile file,
                                @RequestParam(value = "folderId", required = false) Long folderId,
                                @RequestParam(value = "category", required = false) String category) {
        return service.upload(file, folderId, category);
    }

    @GetMapping("/{id}")
    public ArticleDetail detail(@PathVariable Long id) {
        return service.get(id);
    }

    @PutMapping("/{id}")
    public ArticleDetail update(@PathVariable Long id, @Valid @RequestBody UpsertArticleRequest req) {
        return service.update(id, req);
    }

    @PostMapping("/{id}/move")
    public ArticleDetail move(@PathVariable Long id, @RequestBody MoveArticleRequest req) {
        return service.moveArticle(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 启动考点摘要（异步）；已 READY 且非 force 时直接返回。 */
    @PostMapping("/{id}/refine")
    public ArticleDetail refine(@PathVariable Long id, @RequestBody(required = false) RefineRequest req) {
        return service.refine(id, req == null ? new RefineRequest() : req);
    }

    /** 人工保存/精修考点摘要。 */
    @PutMapping("/{id}/summary")
    public ArticleDetail updateSummary(@PathVariable Long id, @RequestBody UpdateSummaryRequest req) {
        return service.updateSummary(id, req);
    }

    /** 开卷预填上下文；摘要未就绪时 400。 */
    @GetMapping("/{id}/open-context")
    public OpenContext openContext(@PathVariable Long id) {
        return service.openContext(id);
    }

    @GetMapping("/{id}/exams")
    public List<ExamListItem> exams(@PathVariable Long id) {
        return service.listExams(id);
    }
}
