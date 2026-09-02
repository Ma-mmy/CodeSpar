package com.codespar.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermission;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.EnumSet;
import java.util.Set;

/**
 * 各家模型 apiKey 的加密存储。
 *
 * <p>AES-256-GCM。主密钥来源优先级：
 * <ol>
 *   <li>环境变量 {@code CODESPAR_MASTER_KEY}（Base64 编码的 32 字节）</li>
 *   <li>本地文件 {@code ~/.codespar/master.key}，首次启动自动生成，权限 600</li>
 * </ol>
 *
 * <p>密文格式：{@code base64(iv[12] || ciphertext || tag[16])}。
 * IV 每次加密随机生成 —— GCM 下 IV 重用会直接泄露明文，绝不能固定。
 */
@Slf4j
@Service
public class CryptoService {

    private static final String ALGORITHM = "AES";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int KEY_BITS = 256;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecureRandom random = new SecureRandom();
    private final String masterKeyFile;
    private final String masterKeyEnv;

    private SecretKey key;

    public CryptoService(
            @Value("${codespar.crypto.master-key-file}") String masterKeyFile,
            @Value("${CODESPAR_MASTER_KEY:}") String masterKeyEnv) {
        this.masterKeyFile = masterKeyFile;
        this.masterKeyEnv = masterKeyEnv;
    }

    @PostConstruct
    void init() {
        byte[] raw = masterKeyEnv != null && !masterKeyEnv.isBlank()
                ? loadFromEnv()
                : loadOrCreateKeyFile();
        this.key = new SecretKeySpec(raw, ALGORITHM);
    }

    private byte[] loadFromEnv() {
        try {
            byte[] raw = Base64.getDecoder().decode(masterKeyEnv.trim());
            if (raw.length != KEY_BITS / 8) {
                throw new IllegalStateException(
                        "CODESPAR_MASTER_KEY 必须是 Base64 编码的 32 字节，当前为 " + raw.length + " 字节");
            }
            log.info("主密钥来源：环境变量 CODESPAR_MASTER_KEY");
            return raw;
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("CODESPAR_MASTER_KEY 不是合法的 Base64", e);
        }
    }

    private byte[] loadOrCreateKeyFile() {
        Path path = Paths.get(masterKeyFile);
        try {
            if (Files.exists(path)) {
                byte[] raw = Base64.getDecoder().decode(Files.readString(path).trim());
                if (raw.length != KEY_BITS / 8) {
                    throw new IllegalStateException("主密钥文件内容损坏：" + path);
                }
                log.info("主密钥来源：{}", path);
                return raw;
            }

            byte[] raw = new byte[KEY_BITS / 8];
            random.nextBytes(raw);

            Files.createDirectories(path.getParent());
            Files.writeString(path, Base64.getEncoder().encodeToString(raw),
                    StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            restrictPermissions(path);

            log.info("已生成新的主密钥：{}（请勿删除，删除后已保存的 apiKey 将无法解密）", path);
            return raw;
        } catch (IOException e) {
            throw new IllegalStateException("读写主密钥文件失败：" + path, e);
        }
    }

    /** 尽力设为 600；非 POSIX 文件系统上跳过并告警，不阻断启动。 */
    private void restrictPermissions(Path path) {
        try {
            Set<PosixFilePermission> perms =
                    EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
            Files.setPosixFilePermissions(path, perms);
        } catch (UnsupportedOperationException | IOException e) {
            log.warn("无法设置主密钥文件权限为 600，请手动检查：{}", path);
        }
    }

    /** 加密。传入 null 或空串返回 null。 */
    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) return null;
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            // 注意：绝不把 plaintext 放进异常信息
            throw new IllegalStateException("加密失败", e);
        }
    }

    /** 解密。传入 null 或空串返回 null。 */
    public String decrypt(String cipherTextBase64) {
        if (cipherTextBase64 == null || cipherTextBase64.isEmpty()) return null;
        try {
            byte[] combined = Base64.getDecoder().decode(cipherTextBase64);
            if (combined.length <= IV_BYTES) {
                throw new IllegalStateException("密文长度异常");
            }

            byte[] iv = new byte[IV_BYTES];
            System.arraycopy(combined, 0, iv, 0, IV_BYTES);
            byte[] cipherText = new byte[combined.length - IV_BYTES];
            System.arraycopy(combined, IV_BYTES, cipherText, 0, cipherText.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(cipherText), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "解密失败。若主密钥文件被更换或删除，已保存的 apiKey 需要重新录入。", e);
        }
    }

    /**
     * 生成给前端展示的掩码，如 {@code sk-abcd…wxyz}。
     * 明文 apiKey 永远不出服务端。
     */
    public static String mask(String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) return "";
        int n = plaintext.length();
        if (n <= 8) return "•".repeat(n);
        return plaintext.substring(0, 4) + "…" + plaintext.substring(n - 4);
    }
}
