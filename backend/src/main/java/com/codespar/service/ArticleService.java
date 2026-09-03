package com.codespar.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.codespar.ai.ChatModelFactory;
import com.codespar.ai.LenientJsonParser;
import com.codespar.ai.PromptBuilder;
import com.codespar.mapper.ArticleFolderMapper;
import com.codespar.mapper.ArticleMapper;
import com.codespar.mapper.ExamMapper;
import com.codespar.model.dto.ArticleDTO;
import com.codespar.model.dto.ArticleDTO.ArticleDetail;
import com.codespar.model.dto.ArticleDTO.ArticleListItem;
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
import com.codespar.model.entity.Article;
import com.codespar.model.entity.ArticleFolder;
import com.codespar.model.entity.Exam;
import com.codespar.model.entity.ModelProfile;
import com.codespar.web.ApiExceptionHandler.BizException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ExecutorService;

@Slf4j
@Service
@RequiredArgsConstructor
public class ArticleService {

    public static final int MAX_BODY_BYTES = 1024 * 1024;
    public static final int MAX_REFINE_BYTES = 200 * 1024;
    private static final int MAX_FOLDER_DEPTH = 5;

    private final ArticleFolderMapper folderMapper;
    private final ArticleMapper articleMapper;
    private final ExamMapper examMapper;
    private final ExamService examService;
    private final ModelProfileService modelService;
    private final CategoryService categoryService;
    private final ChatModelFactory modelFactory;
    private final PromptBuilder promptBuilder;
    private final LenientJsonParser jsonParser;
    private final ExecutorService generationExecutor;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final NotesPath notesPath;

    /* ========================================================== 树 */

    public FolderView tree() {
        List<ArticleFolder> folders = folderMapper.selectList(Wrappers.<ArticleFolder>lambdaQuery()
                .orderByAsc(ArticleFolder::getSortOrder)
                .orderByAsc(ArticleFolder::getId));
        List<Article> articles = articleMapper.selectList(Wrappers.<Article>lambdaQuery()
                .orderByDesc(Article::getUpdatedAt)
                .orderByDesc(Article::getId));

        Map<Long, FolderView> byId = new HashMap<>();
        for (ArticleFolder f : folders) {
            byId.put(f.getId(), toFolderView(f));
        }
        FolderView root = new FolderView();
        root.setId(null);
        root.setName("根目录");
        root.setChildren(new ArrayList<>());
        root.setArticles(new ArrayList<>());

        for (ArticleFolder f : folders) {
            FolderView node = byId.get(f.getId());
            if (f.getParentId() == null) {
                root.getChildren().add(node);
            } else {
                FolderView parent = byId.get(f.getParentId());
                if (parent == null) {
                    root.getChildren().add(node);
                } else {
                    parent.getChildren().add(node);
                }
            }
        }
        for (Article a : articles) {
            ArticleListItem item = toListItem(a);
            if (a.getFolderId() == null) {
                root.getArticles().add(item);
            } else {
                FolderView parent = byId.get(a.getFolderId());
                if (parent == null) {
                    root.getArticles().add(item);
                } else {
                    parent.getArticles().add(item);
                }
            }
        }
        return root;
    }

    @Transactional
    public FolderView createFolder(CreateFolderRequest req) {
        String name = req.getName().trim();
        validateFileName(name);
        if (req.getParentId() != null) {
            getFolderRequired(req.getParentId());
            if (depthOf(req.getParentId()) + 1 > MAX_FOLDER_DEPTH) {
                throw new BizException("文件夹最多嵌套 " + MAX_FOLDER_DEPTH + " 层");
            }
        }
        ArticleFolder f = new ArticleFolder();
        f.setParentId(req.getParentId());
        f.setName(name);
        f.setSortOrder(0);
        f.setSourcePath(folderSourcePath(req.getParentId(), name));
        notesPath.createDirectory(f.getSourcePath());
        folderMapper.insert(f);
        return toFolderView(f);
    }

    @Transactional
    public FolderView renameFolder(Long id, RenameFolderRequest req) {
        ArticleFolder f = getFolderRequired(id);
        validateFileName(req.getName().trim());
        String oldPath = f.getSourcePath();
        f.setName(req.getName().trim());
        if (oldPath != null) {
            String next = folderSourcePath(f.getParentId(), f.getName());
            notesPath.move(oldPath, next);
            f.setSourcePath(next);
            replaceSourcePrefix(oldPath, next, id);
        }
        folderMapper.updateById(f);
        return toFolderView(f);
    }

    @Transactional
    public FolderView moveFolder(Long id, MoveFolderRequest req) {
        ArticleFolder f = getFolderRequired(id);
        Long newParent = req.getParentId();
        if (Objects.equals(id, newParent)) {
            throw new BizException("不能将文件夹移动到自身下");
        }
        if (newParent != null) {
            getFolderRequired(newParent);
            if (isDescendant(newParent, id)) {
                throw new BizException("不能将文件夹移动到其子文件夹下");
            }
            if (depthOf(newParent) + 1 + subtreeHeight(id) > MAX_FOLDER_DEPTH) {
                throw new BizException("移动后超过最大嵌套深度 " + MAX_FOLDER_DEPTH);
            }
        }
        String oldPath = f.getSourcePath();
        f.setParentId(newParent);
        if (req.getSortOrder() != null) {
            f.setSortOrder(req.getSortOrder());
        }
        if (oldPath != null) {
            String next = folderSourcePath(newParent, f.getName());
            notesPath.move(oldPath, next);
            f.setSourcePath(next);
            replaceSourcePrefix(oldPath, next, id);
        }
        folderMapper.updateById(f);
        return toFolderView(f);
    }

    @Transactional
    public void deleteFolder(Long id) {
        ArticleFolder folder = getFolderRequired(id);
        Long childFolders = folderMapper.selectCount(Wrappers.<ArticleFolder>lambdaQuery()
                .eq(ArticleFolder::getParentId, id));
        Long childArticles = articleMapper.selectCount(Wrappers.<Article>lambdaQuery()
                .eq(Article::getFolderId, id));
        if ((childFolders != null && childFolders > 0) || (childArticles != null && childArticles > 0)) {
            throw new BizException("文件夹非空，请先移走或删除其中的文章与子文件夹");
        }
        folderMapper.deleteById(id);
        if (folder.getSourcePath() != null) {
            notesPath.delete(folder.getSourcePath());
        }
    }

    /* ========================================================== 文章 CRUD */

    public ArticleDetail get(Long id) {
        return toDetail(getRequired(id));
    }

    @Transactional
    public ArticleDetail create(UpsertArticleRequest req) {
        validateBody(req.getBodyMd());
        if (req.getFolderId() != null) {
            getFolderRequired(req.getFolderId());
        }
        String category = normalizeCategory(req.getCategory());
        Article a = new Article();
        a.setFolderId(req.getFolderId());
        a.setTitle(req.getTitle().trim());
        a.setCategory(category);
        a.setBodyMd(req.getBodyMd());
        a.setBodyHash(sha256(req.getBodyMd()));
        a.setSummaryStatus("NONE");
        articleMapper.insert(a);
        String source = articleSourcePath(a, req.getTitle());
        notesPath.write(source, req.getBodyMd());
        a.setSourcePath(source);
        articleMapper.updateById(a);
        return toDetail(a);
    }

    @Transactional
    public ArticleDetail update(Long id, UpsertArticleRequest req) {
        Article a = getRequired(id);
        validateBody(req.getBodyMd());
        if (req.getFolderId() != null) {
            getFolderRequired(req.getFolderId());
        }
        String newHash = sha256(req.getBodyMd());
        boolean bodyChanged = !Objects.equals(newHash, a.getBodyHash());
        a.setFolderId(req.getFolderId());
        a.setTitle(req.getTitle().trim());
        a.setCategory(normalizeCategory(req.getCategory()));
        String source = a.getSourcePath() == null ? articleSourcePath(a, req.getTitle()) : a.getSourcePath();
        notesPath.write(source, req.getBodyMd());
        a.setSourcePath(source);
        a.setBodyMd(req.getBodyMd());
        a.setBodyHash(newHash);
        if (bodyChanged && ("READY".equals(a.getSummaryStatus()) || "STALE".equals(a.getSummaryStatus()))) {
            a.setSummaryStatus("STALE");
        } else if (bodyChanged && "FAILED".equals(a.getSummaryStatus())) {
            a.setSummaryStatus("NONE");
            a.setSummaryError(null);
        }
        articleMapper.updateById(a);
        return toDetail(a);
    }

    @Transactional
    public ArticleDetail moveArticle(Long id, MoveArticleRequest req) {
        Article a = getRequired(id);
        if (req.getFolderId() != null) {
            getFolderRequired(req.getFolderId());
        }
        if (a.getSourcePath() != null) {
            String filename = Path.of(a.getSourcePath()).getFileName().toString();
            String next = folderSourcePath(req.getFolderId(), "") + filename;
            notesPath.move(a.getSourcePath(), next);
            a.setSourcePath(next);
        }
        a.setFolderId(req.getFolderId());
        articleMapper.updateById(a);
        return toDetail(a);
    }

    @Transactional
    public ArticleDetail upload(MultipartFile file, Long folderId, String category) {
        if (file == null || file.isEmpty()) {
            throw new BizException("请选择要上传的 Markdown 文件");
        }
        String original = file.getOriginalFilename() == null ? "未命名.md" : file.getOriginalFilename();
        if (!original.toLowerCase().endsWith(".md")) {
            throw new BizException("仅支持上传 .md 文件");
        }
        if (file.getSize() > MAX_BODY_BYTES) {
            throw new BizException("单篇正文不超过 1MB，请拆分后再上传");
        }
        String body;
        try {
            body = new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new BizException("读取文件失败：" + e.getMessage());
        }
        if (body.isBlank()) {
            throw new BizException("文件内容为空");
        }
        validateBody(body);
        if (folderId != null) {
            getFolderRequired(folderId);
        }
        String title = deriveTitle(original, body);
        UpsertArticleRequest req = new UpsertArticleRequest();
        req.setFolderId(folderId);
        req.setTitle(title);
        req.setCategory(category);
        req.setBodyMd(body);
        return create(req);
    }

    /**
     * 删除文章：未交卷一并删；已交/已阅卷保留并断联 article_id。
     */
    @Transactional
    public void delete(Long id) {
        Article article = getRequired(id);
        List<Exam> exams = examMapper.selectList(Wrappers.<Exam>lambdaQuery()
                .eq(Exam::getArticleId, id));
        for (Exam e : exams) {
            if ("NOT_STARTED".equals(e.getStatus()) || "IN_PROGRESS".equals(e.getStatus())) {
                examService.delete(e.getId());
            } else {
                Exam patch = new Exam();
                patch.setId(e.getId());
                patch.setArticleId(null);
                examMapper.updateById(patch);
            }
        }
        articleMapper.deleteById(id);
        if (article.getSourcePath() != null) {
            notesPath.delete(article.getSourcePath());
        }
    }

    /* ========================================================== 摘要 / 开卷 */

    /**
     * 人工精修考点摘要。改摘要不会把状态打回 NONE；有正文摘要则标 READY。
     */
    @Transactional
    public ArticleDetail updateSummary(Long id, UpdateSummaryRequest req) {
        Article a = getRequired(id);
        if (req.getSummaryMd() != null) {
            a.setSummaryMd(req.getSummaryMd());
        }
        if (req.getSummaryJson() != null) {
            try {
                a.setSummaryJson(objectMapper.writeValueAsString(req.getSummaryJson()));
            } catch (Exception e) {
                throw new BizException("结构化摘要不是合法 JSON：" + e.getMessage());
            }
        }
        boolean hasMd = a.getSummaryMd() != null && !a.getSummaryMd().isBlank();
        boolean hasJson = a.getSummaryJson() != null && !a.getSummaryJson().isBlank();
        if (hasMd || hasJson) {
            a.setSummaryStatus("READY");
            a.setSummaryError(null);
        } else {
            a.setSummaryStatus("NONE");
            a.setSummaryError(null);
        }
        articleMapper.updateById(a);
        return toDetail(a);
    }

    public ArticleDetail refine(Long id, RefineRequest req) {
        Article a = getRequired(id);
        if (a.getSourcePath() != null && !notesPath.exists(a.getSourcePath())) throw new BizException("磁盘上的 Markdown 文件已缺失，无法提炼");
        String body = readBody(a);
        if (body.getBytes(StandardCharsets.UTF_8).length > MAX_REFINE_BYTES) throw new BizException("单篇正文超过 200KB，请拆分后再提炼");
        boolean force = req != null && req.isForce();
        if ("RUNNING".equals(a.getSummaryStatus())) {
            return toDetail(a);
        }
        if (!force && "READY".equals(a.getSummaryStatus())) {
            return toDetail(a);
        }
        Long modelId = req == null ? null : req.getModelProfileId();
        ModelProfile model = resolveGenerateModel(modelId);

        Article running = new Article();
        running.setId(id);
        running.setSummaryStatus("RUNNING");
        running.setSummaryError(null);
        running.setSummaryModelId(model.getId());
        running.setSummaryModelSnap(model.getName());
        articleMapper.updateById(running);

        generationExecutor.execute(() -> runRefine(id, model.getId()));
        return toDetail(getRequired(id));
    }

    public OpenContext openContext(Long id) {
        Article a = getRequired(id);
        if (a.getSourcePath() != null && !notesPath.exists(a.getSourcePath())) throw new BizException("磁盘上的 Markdown 文件已缺失，无法开卷");
        if (!"READY".equals(a.getSummaryStatus()) && !"STALE".equals(a.getSummaryStatus())) {
            throw new BizException("请先完成考点摘要提炼后再开卷");
        }
        if (a.getSummaryMd() == null || a.getSummaryMd().isBlank()) {
            throw new BizException("考点摘要为空，请重新提炼后再开卷");
        }
        OpenContext ctx = new OpenContext();
        ctx.setArticleId(a.getId());
        ctx.setTitle(a.getTitle());
        ctx.setCategory(a.getCategory());
        if (a.getCategory() != null && !a.getCategory().isBlank()) {
            ctx.setCategoryLabel(categoryService.labelOf(a.getCategory()));
        }
        ctx.setSummaryStatus(a.getSummaryStatus());
        ctx.setSummaryMd(a.getSummaryMd());
        ctx.setPrompt("请根据文章《" + a.getTitle() + "》的考点摘要出题，侧重高频经典考点与工程实践。");
        return ctx;
    }

    public List<ExamListItem> listExams(Long articleId) {
        getRequired(articleId);
        return examService.listByArticle(articleId);
    }

    public ResponseEntity<byte[]> asset(Long id, String relativePath) {
        Article a = getRequired(id);
        if (a.getSourcePath() == null) throw new BizException("文章没有磁盘来源");
        Path file = notesPath.resolve(Path.of(a.getSourcePath()).getParent() == null ? "" : Path.of(a.getSourcePath()).getParent().toString().replace('\\','/'), relativePath);
        if (!notesPath.isAsset(file.getFileName().toString())) throw new BizException("不支持的图片格式");
        byte[] bytes = notesPath.readBytes(file);
        MediaType type = MediaType.APPLICATION_OCTET_STREAM;
        try { String detected = notesPath.mediaType(file); if (detected != null) type = MediaType.parseMediaType(detected); } catch (Exception ignored) { }
        return ResponseEntity.ok().contentType(type).header("Cache-Control", "no-cache").body(bytes);
    }

    public Article getEntityRequired(Long id) {
        return getRequired(id);
    }

    @Transactional
    public ArticleDTO.SyncResult sync() {
        ArticleDTO.SyncResult result = new ArticleDTO.SyncResult();
        List<ArticleFolder> legacyFolders = folderMapper.selectList(Wrappers.<ArticleFolder>lambdaQuery().isNull(ArticleFolder::getSourcePath));
        legacyFolders.sort((left, right) -> Integer.compare(depthOf(left.getId()), depthOf(right.getId())));
        for (ArticleFolder folder : legacyFolders) {
            String source = folderSourcePath(folder.getParentId(), folder.getName());
            if (folderMapper.selectCount(Wrappers.<ArticleFolder>lambdaQuery().eq(ArticleFolder::getSourcePath, source)) > 0) source += "-" + folder.getId();
            notesPath.createDirectory(source);
            folder.setSourcePath(source);
            folderMapper.updateById(folder);
        }
        Map<String, ArticleFolder> folders = new HashMap<>();
        for (ArticleFolder f : folderMapper.selectList(null)) if (f.getSourcePath() != null) folders.put(f.getSourcePath(), f);
        List<Path> diskDirectories = collectDirs();
        Set<String> seenDirectories = new HashSet<>();
        for (Path dir : diskDirectories) {
            String rel = notesPath.relative(dir);
            if (rel.isEmpty()) continue;
            seenDirectories.add(rel);
            ArticleFolder f = folders.get(rel);
            if (f == null) { f = new ArticleFolder(); f.setName(dir.getFileName().toString()); f.setParentId(parentFolderId(rel, folders)); f.setSortOrder(0); f.setSourcePath(rel); folderMapper.insert(f); folders.put(rel, f); }
        }
        // One-time migration for rows created before source_path existed.
        for (Article legacy : articleMapper.selectList(Wrappers.<Article>lambdaQuery().isNull(Article::getSourcePath))) {
            String source = articleSourcePath(legacy, legacy.getTitle());
            notesPath.write(source, legacy.getBodyMd() == null ? "" : legacy.getBodyMd());
            legacy.setSourcePath(source);
            legacy.setBodyHash(sha256(legacy.getBodyMd() == null ? "" : legacy.getBodyMd()));
            articleMapper.updateById(legacy);
            result.setUpdated(result.getUpdated() + 1);
        }
        Set<String> seen = new HashSet<>();
        for (Path file : notesPath.markdownFiles()) {
            String source = notesPath.relative(file); seen.add(source);
            String body;
            try { body = notesPath.read(file, NotesPath.MAX_ARTICLE_BYTES); } catch (Exception e) { result.setSkipped(result.getSkipped()+1); continue; }
            Article a = articleMapper.selectOne(Wrappers.<Article>lambdaQuery().eq(Article::getSourcePath, source));
            String hash = sha256(body);
            if (a == null) { a = new Article(); a.setSourcePath(source); a.setFolderId(folderIdFor(Path.of(source).getParent(), folders)); a.setTitle(deriveTitle(file.getFileName().toString(), body)); a.setBodyMd(body); a.setBodyHash(hash); a.setSummaryStatus("NONE"); articleMapper.insert(a); result.setAdded(result.getAdded()+1); }
            else if (!Objects.equals(hash, a.getBodyHash())) { a.setTitle(deriveTitle(file.getFileName().toString(), body)); a.setBodyMd(body); a.setBodyHash(hash); if ("READY".equals(a.getSummaryStatus()) || "STALE".equals(a.getSummaryStatus())) a.setSummaryStatus("STALE"); articleMapper.updateById(a); result.setUpdated(result.getUpdated()+1); }
        }
        for (Article a : articleMapper.selectList(Wrappers.<Article>lambdaQuery().isNotNull(Article::getSourcePath))) {
            if (!seen.contains(a.getSourcePath())) {
                List<Exam> linked = examMapper.selectList(Wrappers.<Exam>lambdaQuery().eq(Exam::getArticleId, a.getId()));
                boolean hasSubmitted = linked.stream().anyMatch(e -> !"NOT_STARTED".equals(e.getStatus()) && !"IN_PROGRESS".equals(e.getStatus()));
                if (!hasSubmitted) delete(a.getId());
                result.setMissing(result.getMissing()+1);
            }
        }
        List<ArticleFolder> indexedFolders = folderMapper.selectList(null);
        indexedFolders.sort((left, right) -> Integer.compare(depthOf(right.getId()), depthOf(left.getId())));
        for (ArticleFolder folder : indexedFolders) {
            if (folder.getSourcePath() == null || seenDirectories.contains(folder.getSourcePath())) continue;
            Long childFolders = folderMapper.selectCount(Wrappers.<ArticleFolder>lambdaQuery().eq(ArticleFolder::getParentId, folder.getId()));
            Long childArticles = articleMapper.selectCount(Wrappers.<Article>lambdaQuery().eq(Article::getFolderId, folder.getId()));
            if ((childFolders == null || childFolders == 0) && (childArticles == null || childArticles == 0)) folderMapper.deleteById(folder.getId());
        }
        return result;
    }

    public ArticleDTO.ArticleMeta meta() {
        ArticleDTO.ArticleMeta meta = new ArticleDTO.ArticleMeta();
        meta.setNotesDir(notesPath.getRoot().toString());
        return meta;
    }

    private List<Path> collectDirs() { return notesPath.directories(); }

    private Long parentFolderId(String rel, Map<String, ArticleFolder> folders) { Path p = Path.of(rel).getParent(); ArticleFolder f = p == null ? null : folders.get(p.toString().replace('\\','/')); return f == null ? null : f.getId(); }
    private Long folderIdFor(Path p, Map<String, ArticleFolder> folders) { ArticleFolder f = p == null ? null : folders.get(p.toString().replace('\\','/')); return f == null ? null : f.getId(); }
    private String folderSourcePath(Long parentId, String name) {
        String base = "";
        if (parentId != null) { ArticleFolder p = getFolderRequired(parentId); base = p.getSourcePath() == null ? p.getName() : p.getSourcePath(); }
        return base.isEmpty() ? name : base + "/" + name;
    }
    private String articleSourcePath(Article a, String title) {
        String dir = "";
        if (a.getFolderId() != null) { ArticleFolder f = getFolderRequired(a.getFolderId()); dir = f.getSourcePath() == null ? f.getName() : f.getSourcePath(); }
        String slug = title.trim().replaceAll("[^\\p{L}\\p{N}._-]+", "-");
        if (slug.isBlank()) slug = "article";
        String candidate = (dir.isBlank() ? "" : dir + "/") + slug + "-" + (a.getId() == null ? System.currentTimeMillis() : a.getId()) + ".md";
        return candidate;
    }
    private void replaceSourcePrefix(String oldPrefix, String newPrefix, Long rootFolderId) {
        for (ArticleFolder child : folderMapper.selectList(null)) {
            if (!Objects.equals(child.getId(), rootFolderId) && child.getSourcePath() != null && child.getSourcePath().startsWith(oldPrefix + "/")) {
                child.setSourcePath(newPrefix + child.getSourcePath().substring(oldPrefix.length()));
                folderMapper.updateById(child);
            }
        }
        for (Article article : articleMapper.selectList(null)) {
            if (article.getSourcePath() != null && article.getSourcePath().startsWith(oldPrefix + "/")) {
                article.setSourcePath(newPrefix + article.getSourcePath().substring(oldPrefix.length()));
                articleMapper.updateById(article);
            }
        }
    }
    private String readBody(Article a) { return a.getSourcePath() == null ? a.getBodyMd() : notesPath.read(notesPath.article(a.getSourcePath()), NotesPath.MAX_ARTICLE_BYTES); }

    /* ========================================================== 摘要执行 */

    private void runRefine(Long articleId, Long modelProfileId) {
        try {
            Article a = articleMapper.selectById(articleId);
            if (a == null) {
                return;
            }
            ModelProfile profile = modelService.getRequired(modelProfileId);
            ChatModel chatModel = modelFactory.get(profile);
            String prompt = promptBuilder.buildArticleRefine(
                    a.getTitle(),
                    a.getCategory(),
                    readBody(a));
            ChatResponse resp = chatModel.call(new Prompt(prompt));
            String raw = extractText(resp);
            if (raw == null || raw.isBlank()) {
                throw new IllegalStateException("模型返回空的摘要结果");
            }
            JsonNode node = jsonParser.parse(raw, JsonNode.class);
            String summaryMd = textOrEmpty(node, "summaryMarkdown");
            if (summaryMd.isBlank()) {
                // 兜底：用结构化字段拼一份可读摘要
                summaryMd = fallbackMarkdown(node, a.getTitle());
            }
            String summaryJson = objectMapper.writeValueAsString(node);

            Article done = new Article();
            done.setId(articleId);
            done.setSummaryMd(summaryMd);
            done.setSummaryJson(summaryJson);
            done.setSummaryStatus("READY");
            done.setSummaryError(null);
            done.setBodyHash(a.getBodyHash());
            articleMapper.updateById(done);
            log.info("文章 {} 考点摘要完成，summaryMd={} 字", articleId, summaryMd.length());
        } catch (Exception e) {
            log.warn("文章 {} 考点摘要失败：{}", articleId, e.toString());
            Article failed = new Article();
            failed.setId(articleId);
            failed.setSummaryStatus("FAILED");
            failed.setSummaryError(truncate(Objects.toString(e.getMessage(), e.toString()), 500));
            articleMapper.updateById(failed);
        }
    }

    /* ========================================================== 校验 / 工具 */

    private Article getRequired(Long id) {
        Article a = articleMapper.selectById(id);
        if (a == null) {
            throw new BizException("文章不存在：" + id);
        }
        return a;
    }

    private ArticleFolder getFolderRequired(Long id) {
        ArticleFolder f = folderMapper.selectById(id);
        if (f == null) {
            throw new BizException("文件夹不存在：" + id);
        }
        return f;
    }

    private void validateBody(String body) {
        if (body == null || body.isBlank()) {
            throw new BizException("请填写正文");
        }
        int bytes = body.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_BODY_BYTES) {
            throw new BizException("单篇正文不超过 1MB，当前约 " + (bytes / 1024) + "KB，请拆分后再保存");
        }
    }

    private String normalizeCategory(String code) {
        return categoryService.requireExistingOrNull(code);
    }
    private void validateFileName(String name) { if (name.equals(".") || name.equals("..") || name.contains("/") || name.contains("\\") || name.indexOf('\0') >= 0) throw new BizException("文件夹名称无效"); }

    private ModelProfile resolveGenerateModel(Long modelId) {
        if (modelId != null) {
            ModelProfile m = modelService.getRequired(modelId);
            if (!Boolean.TRUE.equals(m.getCanGenerate()) || !Boolean.TRUE.equals(m.getEnabled())) {
                throw new BizException("请选择已启用且可用于出题的模型");
            }
            return m;
        }
        return modelService.getDefaultFor(true);
    }

    private int depthOf(Long folderId) {
        int depth = 0;
        Long cur = folderId;
        Set<Long> seen = new HashSet<>();
        while (cur != null) {
            if (!seen.add(cur)) {
                break;
            }
            depth++;
            ArticleFolder f = folderMapper.selectById(cur);
            cur = f == null ? null : f.getParentId();
        }
        return depth;
    }

    private int subtreeHeight(Long folderId) {
        List<ArticleFolder> all = folderMapper.selectList(null);
        Map<Long, List<Long>> children = new HashMap<>();
        for (ArticleFolder f : all) {
            if (f.getParentId() != null) {
                children.computeIfAbsent(f.getParentId(), k -> new ArrayList<>()).add(f.getId());
            }
        }
        return height(folderId, children, new HashSet<>());
    }

    private int height(Long id, Map<Long, List<Long>> children, Set<Long> stack) {
        if (!stack.add(id)) {
            return 0;
        }
        List<Long> kids = children.getOrDefault(id, List.of());
        int max = 0;
        for (Long kid : kids) {
            max = Math.max(max, height(kid, children, stack));
        }
        stack.remove(id);
        return max + 1;
    }

    private boolean isDescendant(Long maybeDescendant, Long ancestorId) {
        Long cur = maybeDescendant;
        Set<Long> seen = new HashSet<>();
        while (cur != null && seen.add(cur)) {
            if (Objects.equals(cur, ancestorId)) {
                return true;
            }
            ArticleFolder f = folderMapper.selectById(cur);
            cur = f == null ? null : f.getParentId();
        }
        return false;
    }

    private static String deriveTitle(String filename, String body) {
        for (String line : body.split("\n")) {
            String t = line.trim();
            if (t.startsWith("# ")) {
                String h = t.substring(2).trim();
                if (!h.isEmpty()) {
                    return h.length() > 200 ? h.substring(0, 200) : h;
                }
            }
        }
        String name = filename;
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) {
            name = name.substring(slash + 1);
        }
        if (name.toLowerCase().endsWith(".md")) {
            name = name.substring(0, name.length() - 3);
        }
        return name.isBlank() ? "未命名文章" : (name.length() > 200 ? name.substring(0, 200) : name);
    }

    private static String sha256(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] dig = md.digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(dig);
        } catch (Exception e) {
            throw new IllegalStateException("计算正文摘要失败", e);
        }
    }

    private static String extractText(ChatResponse response) {
        if (response == null || response.getResult() == null || response.getResult().getOutput() == null) {
            return "";
        }
        String text = response.getResult().getOutput().getText();
        return text == null ? "" : text.trim();
    }

    private static String textOrEmpty(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return "";
        }
        return node.get(field).asText("").trim();
    }

    private static String fallbackMarkdown(JsonNode node, String title) {
        StringBuilder sb = new StringBuilder();
        sb.append("# ").append(title).append(" — 考点摘要\n\n");
        if (node.has("keypoints") && node.get("keypoints").isArray()) {
            sb.append("## 高频考点\n\n");
            for (JsonNode k : node.get("keypoints")) {
                sb.append("- **").append(textOrEmpty(k, "title")).append("**：")
                        .append(textOrEmpty(k, "detail")).append('\n');
            }
            sb.append('\n');
        }
        if (node.has("classicQuestions") && node.get("classicQuestions").isArray()) {
            sb.append("## 经典问题\n\n");
            int i = 1;
            for (JsonNode q : node.get("classicQuestions")) {
                sb.append(i++).append(". ").append(textOrEmpty(q, "question")).append('\n');
            }
        }
        return sb.toString().trim();
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }

    private FolderView toFolderView(ArticleFolder f) {
        FolderView v = new FolderView();
        v.setId(f.getId());
        v.setParentId(f.getParentId());
        v.setName(f.getName());
        v.setSortOrder(f.getSortOrder());
        v.setCreatedAt(f.getCreatedAt());
        v.setChildren(new ArrayList<>());
        v.setArticles(new ArrayList<>());
        return v;
    }

    private ArticleListItem toListItem(Article a) {
        ArticleListItem v = new ArticleListItem();
        v.setId(a.getId());
        v.setFolderId(a.getFolderId());
        v.setTitle(a.getTitle());
        v.setCategory(a.getCategory());
        if (a.getCategory() != null && !a.getCategory().isBlank()) {
            v.setCategoryLabel(categoryService.labelOf(a.getCategory()));
        }
        v.setSummaryStatus(a.getSummaryStatus());
        v.setCreatedAt(a.getCreatedAt());
        v.setUpdatedAt(a.getUpdatedAt());
        v.setSourcePath(a.getSourcePath());
        v.setMissing(a.getSourcePath() != null && !notesPath.exists(a.getSourcePath()));
        return v;
    }

    private ArticleDetail toDetail(Article a) {
        ArticleDetail v = new ArticleDetail();
        v.setId(a.getId());
        v.setFolderId(a.getFolderId());
        v.setTitle(a.getTitle());
        v.setCategory(a.getCategory());
        if (a.getCategory() != null && !a.getCategory().isBlank()) {
            v.setCategoryLabel(categoryService.labelOf(a.getCategory()));
        }
        try { v.setBodyMd(readBody(a)); } catch (BizException e) { v.setBodyMd(""); }
        v.setSourcePath(a.getSourcePath());
        v.setMissing(a.getSourcePath() != null && !notesPath.exists(a.getSourcePath()));
        v.setSummaryMd(a.getSummaryMd());
        v.setSummaryStatus(a.getSummaryStatus());
        v.setSummaryError(a.getSummaryError());
        v.setSummaryModelId(a.getSummaryModelId());
        v.setSummaryModelSnap(a.getSummaryModelSnap());
        v.setCreatedAt(a.getCreatedAt());
        v.setUpdatedAt(a.getUpdatedAt());
        v.setOpenPromptHint("请根据文章《" + a.getTitle() + "》的考点摘要出题，侧重高频经典考点与工程实践。");
        if (a.getSummaryJson() != null && !a.getSummaryJson().isBlank()) {
            try {
                v.setSummaryJson(objectMapper.readValue(a.getSummaryJson(), Object.class));
            } catch (Exception e) {
                v.setSummaryJson(a.getSummaryJson());
            }
        }
        return v;
    }
}
