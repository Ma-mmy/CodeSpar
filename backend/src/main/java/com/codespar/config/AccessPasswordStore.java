package com.codespar.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.EnumSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 单人访问口令。配置里的 {@code CODESPAR_ACCESS_PASSWORD} 只是默认值；
 * 设置页改过之后以 {@code access.hash} 为准，配置不再覆盖。
 */
@Slf4j
@Service
public class AccessPasswordStore {

    public static final int MIN_LENGTH = 8;

    private final String hashFile;
    private final String configPassword;
    private final String bindAddress;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final AtomicInteger generation = new AtomicInteger(0);

    private volatile String hash;
    private volatile boolean managedByConfig;

    public AccessPasswordStore(
            @Value("${codespar.access.hash-file}") String hashFile,
            @Value("${codespar.access.password:}") String configPassword,
            @Value("${server.address:127.0.0.1}") String bindAddress) {
        this.hashFile = hashFile;
        this.configPassword = configPassword;
        this.bindAddress = bindAddress;
    }

    @PostConstruct
    void init() {
        Path path = Paths.get(hashFile);
        try {
            if (Files.exists(path)) {
                String loaded = Files.readString(path).trim();
                if (loaded.isEmpty()) {
                    throw new IllegalStateException("访问口令哈希文件为空：" + path);
                }
                this.hash = loaded;
                this.managedByConfig = false;
                this.generation.set(1);
                log.info("访问口令已启用（自定义，来源：{}）", path);
                return;
            }
        } catch (IOException e) {
            throw new IllegalStateException("读取访问口令哈希失败：" + path, e);
        }

        if (configPassword != null && !configPassword.isBlank()) {
            if (configPassword.length() < MIN_LENGTH) {
                throw new IllegalStateException(
                        "CODESPAR_ACCESS_PASSWORD 至少 " + MIN_LENGTH + " 位");
            }
            this.hash = null;
            this.managedByConfig = true;
            this.generation.set(1);
            log.info("访问口令已启用（配置中的默认口令；可在设置页修改）");
            return;
        }

        if (!isLoopback(bindAddress)) {
            throw new IllegalStateException(
                    "监听地址 " + bindAddress + " 不是本机回环，必须在配置里设置 CODESPAR_ACCESS_PASSWORD（至少 "
                            + MIN_LENGTH + " 位）再启动。");
        }
        log.warn("未配置访问口令，HTTP API 对本机开放。远程访问请在配置文件写入 CODESPAR_ACCESS_PASSWORD 后重启。");
    }

    public boolean isEnabled() {
        return managedByConfig || hash != null;
    }

    /** true：仍在用配置里的默认口令，尚未在设置页改过。 */
    public boolean isManagedByConfig() {
        return managedByConfig;
    }

    public int generation() {
        return generation.get();
    }

    /** 用于让持久解锁凭证绑定当前口令；只返回不可逆摘要，不暴露口令或 BCrypt 哈希。 */
    public String credentialFingerprint() {
        String current = managedByConfig ? configPassword : hash;
        if (current == null) {
            return "";
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(current.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("JVM 不支持 SHA-256", e);
        }
    }

    public boolean matches(String plaintext) {
        if (plaintext == null) {
            return false;
        }
        if (managedByConfig) {
            byte[] expected = configPassword.getBytes(StandardCharsets.UTF_8);
            byte[] actual = plaintext.getBytes(StandardCharsets.UTF_8);
            return MessageDigest.isEqual(expected, actual);
        }
        String current = hash;
        if (current == null) {
            return false;
        }
        return encoder.matches(plaintext, current);
    }

    public void changePassword(String currentPlain, String nextPlain) {
        if (!isEnabled()) {
            throw new IllegalStateException("当前未启用访问口令");
        }
        if (!matches(currentPlain)) {
            throw new com.codespar.web.ApiExceptionHandler.BizException("当前口令不正确");
        }
        if (nextPlain == null || nextPlain.length() < MIN_LENGTH) {
            throw new com.codespar.web.ApiExceptionHandler.BizException("新口令至少 " + MIN_LENGTH + " 位");
        }
        writeHash(encoder.encode(nextPlain));
        this.managedByConfig = false;
        generation.incrementAndGet();
        log.info("访问口令已更新，旧会话将失效");
    }

    private void writeHash(String newHash) {
        Path path = Paths.get(hashFile);
        try {
            Path parent = path.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Path tmp = path.resolveSibling(path.getFileName() + ".tmp");
            Files.writeString(tmp, newHash + System.lineSeparator(),
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            restrictPermissions(tmp);
            try {
                Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicUnsupported) {
                Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING);
            }
            restrictPermissions(path);
            this.hash = newHash;
        } catch (IOException e) {
            throw new IllegalStateException("写入访问口令哈希失败：" + path, e);
        }
    }

    private static void restrictPermissions(Path path) {
        try {
            Set<PosixFilePermission> perms =
                    EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
            Files.setPosixFilePermissions(path, perms);
        } catch (UnsupportedOperationException | IOException e) {
            log.warn("无法设置访问口令哈希文件权限为 600，请手动检查：{}", path);
        }
    }

    static boolean isLoopback(String address) {
        if (address == null || address.isBlank()) {
            return true;
        }
        String a = address.trim();
        return "127.0.0.1".equals(a) || "::1".equals(a) || "localhost".equalsIgnoreCase(a);
    }
}
