package com.codespar.config;

import com.codespar.web.ApiExceptionHandler.BizException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class AccessPasswordStoreTest {

    @TempDir
    Path tempDir;

    @Test
    void loopbackWithoutPasswordStaysDisabled() {
        AccessPasswordStore store = newStore(tempDir.resolve("access.hash"), "", "127.0.0.1");
        store.init();
        assertFalse(store.isEnabled());
        assertFalse(store.isManagedByConfig());
        assertFalse(store.matches("anything"));
        assertFalse(Files.exists(tempDir.resolve("access.hash")));
    }

    @Test
    void nonLoopbackWithoutPasswordFailsFast() {
        AccessPasswordStore store = newStore(tempDir.resolve("access.hash"), "", "0.0.0.0");
        IllegalStateException ex = assertThrows(IllegalStateException.class, store::init);
        assertTrue(ex.getMessage().contains("CODESPAR_ACCESS_PASSWORD"));
    }

    @Test
    void configPasswordEnablesWithoutWritingHashFile() {
        Path hashPath = tempDir.resolve("nested").resolve("access.hash");
        AccessPasswordStore store = newStore(hashPath, "correct-horse", "127.0.0.1");
        store.init();

        assertTrue(store.isEnabled());
        assertTrue(store.isManagedByConfig());
        assertFalse(Files.exists(hashPath), "配置口令不应再写 access.hash");
        assertTrue(store.matches("correct-horse"));
        assertFalse(store.matches("wrong-password"));
    }

    @Test
    void hashFileWinsOverConfigDefault() throws Exception {
        Path hashPath = tempDir.resolve("access.hash");
        Files.writeString(hashPath, new BCryptPasswordEncoder().encode("file-password"));

        AccessPasswordStore store = newStore(hashPath, "config-password", "127.0.0.1");
        store.init();

        assertFalse(store.isManagedByConfig());
        assertTrue(store.matches("file-password"));
        assertFalse(store.matches("config-password"));
    }

    @Test
    void hashFileUsedWhenConfigEmpty() throws Exception {
        Path hashPath = tempDir.resolve("access.hash");
        Files.writeString(hashPath, new BCryptPasswordEncoder().encode("file-secret-1"));

        AccessPasswordStore store = newStore(hashPath, "", "127.0.0.1");
        store.init();

        assertTrue(store.isEnabled());
        assertFalse(store.isManagedByConfig());
        assertTrue(store.matches("file-secret-1"));
    }

    @Test
    void changePasswordFromDefaultWritesHashAndIgnoresConfig() {
        Path hashPath = tempDir.resolve("access.hash");
        AccessPasswordStore store = newStore(hashPath, "old-secret-1", "127.0.0.1");
        store.init();
        assertTrue(store.isManagedByConfig());

        store.changePassword("old-secret-1", "new-secret-1");

        assertTrue(Files.exists(hashPath));
        assertFalse(store.isManagedByConfig());
        assertTrue(store.matches("new-secret-1"));
        assertFalse(store.matches("old-secret-1"));

        AccessPasswordStore reloaded = newStore(hashPath, "old-secret-1", "127.0.0.1");
        reloaded.init();
        assertFalse(reloaded.isManagedByConfig());
        assertTrue(reloaded.matches("new-secret-1"));
        assertFalse(reloaded.matches("old-secret-1"));
    }

    @Test
    void changePasswordOnHashFileBumpsGeneration() throws Exception {
        Path hashPath = tempDir.resolve("access.hash");
        Files.writeString(hashPath, new BCryptPasswordEncoder().encode("old-secret-1"));
        AccessPasswordStore store = newStore(hashPath, "", "127.0.0.1");
        store.init();
        int gen = store.generation();

        store.changePassword("old-secret-1", "new-secret-1");

        assertTrue(store.matches("new-secret-1"));
        assertFalse(store.matches("old-secret-1"));
        assertEquals(gen + 1, store.generation());
    }

    @Test
    void changePasswordRejectsWrongCurrent() throws Exception {
        Path hashPath = tempDir.resolve("access.hash");
        Files.writeString(hashPath, new BCryptPasswordEncoder().encode("old-secret-1"));
        AccessPasswordStore store = newStore(hashPath, "", "127.0.0.1");
        store.init();
        assertThrows(BizException.class, () -> store.changePassword("nope-nope", "new-secret-1"));
        assertTrue(store.matches("old-secret-1"));
    }

    @Test
    void configRejectsShortPassword() {
        AccessPasswordStore store = newStore(tempDir.resolve("access.hash"), "short", "127.0.0.1");
        IllegalStateException ex = assertThrows(IllegalStateException.class, store::init);
        assertTrue(ex.getMessage().contains("至少"));
    }

    @Test
    void isLoopbackRecognizesLocalAddresses() {
        assertTrue(AccessPasswordStore.isLoopback("127.0.0.1"));
        assertTrue(AccessPasswordStore.isLoopback("localhost"));
        assertTrue(AccessPasswordStore.isLoopback("::1"));
        assertTrue(AccessPasswordStore.isLoopback(""));
        assertFalse(AccessPasswordStore.isLoopback("0.0.0.0"));
        assertFalse(AccessPasswordStore.isLoopback("192.168.1.5"));
    }

    private AccessPasswordStore newStore(Path hashPath, String password, String bind) {
        return new AccessPasswordStore(hashPath.toString(), password, bind);
    }
}
