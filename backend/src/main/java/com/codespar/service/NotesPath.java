package com.codespar.service;

import com.codespar.web.ApiExceptionHandler.BizException;
import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.LinkOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Comparator;
import java.util.stream.Stream;

/** All access to the on-disk article tree goes through this path guard. */
@Component
public class NotesPath {
    public static final long MAX_ARTICLE_BYTES = 1024L * 1024L;
    public static final long MAX_ASSET_BYTES = 8L * 1024L * 1024L;
    @Getter
    private final Path root;
    private final Path realRoot;

    public NotesPath(@Value("${codespar.notes.dir:}") String configured,
                     @Value("${spring.datasource.url}") String datasourceUrl) {
        String value = configured == null ? "" : configured.trim();
        if (!value.isEmpty() && !Paths.get(value).isAbsolute()) throw new IllegalStateException("CODESPAR_NOTES_DIR 必须是绝对路径");
        if (value.isEmpty()) {
            if (datasourceUrl == null || !datasourceUrl.startsWith("jdbc:sqlite:")) throw new IllegalStateException("无法从数据库配置推导资料根");
            String db = datasourceUrl.substring("jdbc:sqlite:".length());
            int query = db.indexOf('?');
            if (query >= 0) db = db.substring(0, query);
            Path dbFile = Paths.get(db);
            value = dbFile.toAbsolutePath().getParent().resolve("notes").toString();
        }
        try {
            Path candidate = Paths.get(value).toAbsolutePath().normalize();
            if (candidate.getNameCount() == 0) {
                throw new IllegalArgumentException("资料根不能设为 / ");
            }
            Files.createDirectories(candidate);
            this.realRoot = candidate.toRealPath();
            this.root = realRoot;
            if (realRoot.getNameCount() == 0) throw new IllegalArgumentException("资料根不能设为 / ");
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("创建资料根失败：" + e.getMessage(), e);
        }
    }

    public Path article(String sourcePath) { return resolveRelative(sourcePath, false); }

    public Path resolve(String fromDir, String relative) {
        if (relative == null || relative.isBlank() || relative.indexOf('\0') >= 0 || Paths.get(relative).isAbsolute()) {
            throw new BizException("图片路径无效");
        }
        if (relative.contains("\\")) throw new BizException("图片路径无效");
        String[] parts = relative.split("/", -1);
        for (String part : parts) if (part.isEmpty()) throw new BizException("图片路径无效");
        Path base = fromDir == null || fromDir.isBlank() ? root : article(fromDir);
        Path candidate = base.resolve(relative).normalize();
        ensureInside(candidate);
        return existingInside(candidate);
    }

    public String read(Path path, long maxBytes) {
        try {
            Path safe = existingInside(path);
            if (!Files.isRegularFile(safe) || Files.size(safe) > maxBytes) throw new BizException("文件过大或不存在");
            return Files.readString(safe, StandardCharsets.UTF_8);
        } catch (IOException e) { throw new BizException("读取资料失败：" + e.getMessage()); }
    }

    public byte[] readBytes(Path path) {
        try {
            Path safe = existingInside(path);
            if (!Files.isRegularFile(safe) || Files.size(safe) > MAX_ASSET_BYTES) throw new BizException("图片过大或不存在");
            return Files.readAllBytes(safe);
        } catch (IOException e) { throw new BizException("读取图片失败：" + e.getMessage()); }
    }

    public void write(String sourcePath, String body) {
        Path file = resolveRelative(sourcePath, true);
        try { Files.createDirectories(file.getParent()); Files.writeString(file, body, StandardCharsets.UTF_8); }
        catch (IOException e) { throw new BizException("写入文章失败：" + e.getMessage()); }
    }

    public void createDirectory(String sourcePath) {
        Path dir = resolveRelative(sourcePath, true);
        try { Files.createDirectories(dir); } catch (IOException e) { throw new BizException("创建资料目录失败：" + e.getMessage()); }
    }

    public void move(String from, String to) {
        Path source = resolveRelative(from, false);
        Path target = resolveRelative(to, true);
        try { if (target.getParent() != null) Files.createDirectories(target.getParent()); Files.move(source, target); }
        catch (IOException e) { throw new BizException("移动资料失败：" + e.getMessage()); }
    }

    public void delete(String sourcePath) {
        Path target = resolveRelative(sourcePath, true);
        try { Files.deleteIfExists(target); } catch (IOException e) { throw new BizException("删除资料失败：" + e.getMessage()); }
    }

    public boolean exists(String sourcePath) {
        if (sourcePath == null) return false;
        try { return Files.exists(resolveRelative(sourcePath, false)); } catch (BizException e) { return false; }
    }

    public List<Path> directories() {
        List<Path> result = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(realRoot)) {
            stream.filter(Files::isDirectory).filter(p -> !Files.isSymbolicLink(p)).filter(p -> !p.equals(realRoot)).filter(this::isRealInside).filter(p -> !isSkipped(p)).sorted(Comparator.comparingInt(Path::getNameCount)).forEach(result::add);
        } catch (IOException e) { throw new BizException("扫描资料目录失败：" + e.getMessage()); }
        return result;
    }

    public String mediaType(Path path) {
        try { return Files.probeContentType(existingInside(path)); } catch (IOException e) { return null; }
    }

    public List<Path> markdownFiles() {
        List<Path> result = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(realRoot)) {
            stream.filter(Files::isRegularFile).filter(this::isRealInside).filter(p -> !isSkipped(p)).filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md")).forEach(result::add);
        } catch (IOException e) { throw new BizException("扫描资料目录失败：" + e.getMessage()); }
        return result;
    }

    public String relative(Path path) { Path safe = existingInside(path); return realRoot.relativize(safe).toString().replace(safe.getFileSystem().getSeparator(), "/"); }

    public boolean isAsset(String name) { String ext = name == null ? "" : name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT); return List.of("png", "jpg", "jpeg", "gif", "webp").contains(ext); }

    private Path resolveRelative(String sourcePath, boolean allowMissing) {
        if (sourcePath == null || sourcePath.isBlank() || sourcePath.indexOf('\0') >= 0 || Paths.get(sourcePath).isAbsolute() || sourcePath.contains("\\")) throw new BizException("资料路径无效");
        for (String part : sourcePath.split("/", -1)) if (part.isEmpty()) throw new BizException("资料路径无效");
        Path candidate = root.resolve(sourcePath).normalize();
        ensureInside(candidate);
        if (allowMissing) { ensureRealAncestorInside(candidate); return candidate; }
        return existingInside(candidate);
    }

    private Path existingInside(Path candidate) {
        try { Path real = candidate.toRealPath(); ensureInside(real); return real; }
        catch (IOException e) { throw new BizException("资料文件不存在"); }
    }
    private void ensureRealAncestorInside(Path candidate) {
        Path current = candidate;
        while (current != null && !Files.exists(current, LinkOption.NOFOLLOW_LINKS)) current = current.getParent();
        if (current == null) throw new BizException("资料路径无效");
        try { ensureInside(current.toRealPath()); } catch (IOException e) { throw new BizException("资料路径无效"); }
    }
    private void ensureInside(Path candidate) { if (!candidate.toAbsolutePath().normalize().startsWith(realRoot)) throw new BizException("路径超出资料根目录"); }
    private boolean isRealInside(Path path) { try { return path.toRealPath().startsWith(realRoot); } catch (IOException e) { return false; } }
    private boolean isSkipped(Path p) { for (Path part : realRoot.relativize(p.toAbsolutePath().normalize())) { String n = part.toString(); if (n.equals(".DS_Store") || n.equals(".git") || n.equals("node_modules") || n.startsWith(".")) return true; } return false; }
}
