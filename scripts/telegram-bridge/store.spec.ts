import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import {
  mediaPath,
  sanitizeFilename,
  gcInboxMedia,
  INBOX_MEDIA_DIR,
} from "./store";

const TMP_SESSION = "spec-session-1";
const SESSION_DIR = join(INBOX_MEDIA_DIR, TMP_SESSION);

describe("sanitizeFilename", () => {
  test("should strip path separators and null bytes", () => {
    expect(sanitizeFilename("../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeFilename("a\\b/c\0d")).toBe("abcd");
  });

  test("should strip leading dots", () => {
    expect(sanitizeFilename("...env")).toBe("env");
  });

  test("should fall back to 'file' when result is empty", () => {
    expect(sanitizeFilename("///")).toBe("file");
    expect(sanitizeFilename("")).toBe("file");
  });

  test("should preserve normal filenames", () => {
    expect(sanitizeFilename("report.pdf")).toBe("report.pdf");
  });
});

describe("mediaPath", () => {
  test("should build photo path as <msgId>.<ext>", () => {
    const p = mediaPath("sess-a", 37, ".jpg");
    expect(p).toBe(join(INBOX_MEDIA_DIR, "sess-a", "37.jpg"));
  });

  test("should build document path as <msgId>-<sanitized-filename>", () => {
    const p = mediaPath("sess-b", 42, undefined, "report.pdf");
    expect(p).toBe(join(INBOX_MEDIA_DIR, "sess-b", "42-report.pdf"));
  });

  test("should sanitize document filename", () => {
    const p = mediaPath("sess-c", 1, undefined, "../boom.txt");
    expect(p).toBe(join(INBOX_MEDIA_DIR, "sess-c", "1-boom.txt"));
  });
});

describe("gcInboxMedia", () => {
  beforeEach(async () => {
    await rm(SESSION_DIR, { recursive: true, force: true });
    await mkdir(SESSION_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(SESSION_DIR, { recursive: true, force: true });
  });

  test("should unlink files older than TTL", async () => {
    const oldFile = join(SESSION_DIR, "old.jpg");
    const newFile = join(SESSION_DIR, "new.jpg");
    await writeFile(oldFile, "x");
    await writeFile(newFile, "x");

    // Backdate oldFile mtime by 10 days.
    const tenDaysAgoMs = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const tenDaysAgo = new Date(tenDaysAgoMs);
    const { utimes } = await import("node:fs/promises");
    await utimes(oldFile, tenDaysAgo, tenDaysAgo);

    await gcInboxMedia(7 * 24 * 60 * 60 * 1000);

    expect(await Bun.file(oldFile).exists()).toBe(false);
    expect(await Bun.file(newFile).exists()).toBe(true);
  });

  test("should not throw on missing directory", async () => {
    await rm(SESSION_DIR, { recursive: true, force: true });
    await expect(gcInboxMedia(1000)).resolves.toBeUndefined();
  });
});
