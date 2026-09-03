package com.codespar.service;

import com.codespar.web.ApiExceptionHandler.BizException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class NotesPathTest {
    @TempDir Path temp;

    @Test
    void resolvesRelativeAssetsInsideRoot() throws Exception {
        Path root = temp.resolve("notes");
        Files.createDirectories(root.resolve("posts/img"));
        Files.createDirectories(root.resolve("access"));
        Files.writeString(root.resolve("posts/img/a.png"), "x");
        Files.writeString(root.resolve("access/a.png"), "x");
        NotesPath notes = new NotesPath(root.toString(), "jdbc:sqlite:" + temp.resolve("db.sqlite"));

        assertEquals(root.resolve("posts/img/a.png").toRealPath(), notes.resolve("posts", "img/a.png"));
        assertEquals(root.resolve("access/a.png").toRealPath(), notes.resolve("posts", "../access/a.png"));
    }

    @Test
    void rejectsEscapeAbsoluteAndSymlinkEscape() throws Exception {
        Path root = temp.resolve("notes");
        Files.createDirectories(root.resolve("posts"));
        Files.writeString(temp.resolve("outside.png"), "x");
        NotesPath notes = new NotesPath(root.toString(), "jdbc:sqlite:" + temp.resolve("db.sqlite"));

        assertThrows(BizException.class, () -> notes.resolve("posts", "../../outside.png"));
        assertThrows(BizException.class, () -> notes.resolve("posts", temp.resolve("outside.png").toString()));
        try {
            Files.createSymbolicLink(root.resolve("posts/link.png"), temp.resolve("outside.png"));
            assertThrows(BizException.class, () -> notes.resolve("posts", "link.png"));
        } catch (UnsupportedOperationException ignored) {
            // Filesystem does not support symbolic links.
        }
    }

    @Test
    void rejectsWriteThroughSymlinkDirectory() throws Exception {
        Path root = temp.resolve("notes");
        Path outside = temp.resolve("outside");
        Files.createDirectories(root);
        Files.createDirectories(outside);
        NotesPath notes = new NotesPath(root.toString(), "jdbc:sqlite:" + temp.resolve("db.sqlite"));
        Files.createSymbolicLink(root.resolve("linked"), outside);

        assertThrows(BizException.class, () -> notes.write("linked/article.md", "# nope"));
    }
}
