package com.codespar.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class CryptoServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void encryptsAndDecryptsWithFreshRandomIv() {
        CryptoService service = newService(tempDir.resolve("master.key"), "");
        service.init();

        String first = service.encrypt("sk-secret-value");
        String second = service.encrypt("sk-secret-value");

        assertNotNull(first);
        assertNotEquals(first, second, "同一明文每次加密都必须使用新的 IV");
        assertEquals("sk-secret-value", service.decrypt(first));
        assertEquals("sk-secret-value", service.decrypt(second));
    }

    @Test
    void createsKeyFileAndRestrictsPermissionsWhenSupported() throws Exception {
        Path keyPath = tempDir.resolve("nested").resolve("master.key");
        CryptoService service = newService(keyPath, "");
        service.init();

        assertTrue(Files.exists(keyPath));
        assertEquals("secret", service.decrypt(service.encrypt("secret")));

        try {
            Set<PosixFilePermission> permissions = Files.getPosixFilePermissions(keyPath);
            assertEquals(Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE), permissions);
        } catch (UnsupportedOperationException ignored) {
            // Windows 等非 POSIX 文件系统跳过权限断言
        }
    }

    @Test
    void environmentKeyTakesPrecedenceOverFile() {
        String key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32 zero bytes
        Path keyPath = tempDir.resolve("master.key");
        CryptoService service = newService(keyPath, key);
        service.init();

        assertFalse(Files.exists(keyPath), "使用环境变量时不应创建主密钥文件");
        assertEquals("secret", service.decrypt(service.encrypt("secret")));
    }

    @Test
    void detectsTampering() {
        CryptoService service = newService(tempDir.resolve("master.key"), "");
        service.init();
        String cipher = service.encrypt("secret");
        String tampered = cipher.substring(0, cipher.length() - 2) + "xx";

        assertThrows(IllegalStateException.class, () -> service.decrypt(tampered));
    }

    @Test
    void masksWithoutReturningPlaintext() {
        assertEquals("sk-a…xyz9", CryptoService.mask("sk-abcdef-xyz9"));
        assertEquals("••••••••", CryptoService.mask("12345678"));
        assertEquals("", CryptoService.mask(null));
    }

    private CryptoService newService(Path keyPath, String envKey) {
        return new CryptoService(keyPath.toString(), envKey);
    }
}
