import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import {
  mediaPath,
  sanitizeFilename,
  gcInboxMedia,
  ensureMediaDir,
  INBOX_MEDIA_DIR,
} from "./store";

const DAY_MS = 24 * 60 * 60 * 1000;
const TEN_DAYS_MS = 10 * DAY_MS;
const SEVEN_DAYS_MS = 7 * DAY_MS;

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

  test("should sanitize session name with special characters", () => {
    const p = mediaPath("my session!", 99, ".png");
    expect(p).toBe(join(INBOX_MEDIA_DIR, "my_session_", "99.png"));
  });
});

describe("ensureMediaDir", () => {
  const SESSION = "ensure-dir-test";
  const DIR = join(INBOX_MEDIA_DIR, SESSION);

  afterEach(async () => {
    await rm(DIR, { recursive: true, force: true });
  });

  test("should create and return the session media directory", async () => {
    await rm(DIR, { recursive: true, force: true });
    const returned = await ensureMediaDir(SESSION);
    expect(returned).toBe(DIR);
    const s = await stat(DIR);
    expect(s.isDirectory()).toBe(true);
  });

  test("should be idempotent when directory already exists", async () => {
    await mkdir(DIR, { recursive: true });
    await expect(ensureMediaDir(SESSION)).resolves.toBe(DIR);
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
    const tenDaysAgo = new Date(Date.now() - TEN_DAYS_MS);
    const { utimes } = await import("node:fs/promises");
    await utimes(oldFile, tenDaysAgo, tenDaysAgo);

    await gcInboxMedia(SEVEN_DAYS_MS);

    expect(await Bun.file(oldFile).exists()).toBe(false);
    expect(await Bun.file(newFile).exists()).toBe(true);
  });

  test("should not throw on missing directory", async () => {
    await rm(SESSION_DIR, { recursive: true, force: true });
    await expect(gcInboxMedia(1000)).resolves.toBeUndefined();
  });

  test("should keep deleting other files when one unlink fails", async () => {
    const blocker = join(SESSION_DIR, "blocker");
    const victim = join(SESSION_DIR, "victim.jpg");

    // blocker is a non-empty directory — unlink() on it will throw EISDIR.
    await mkdir(blocker, { recursive: true });
    await writeFile(join(blocker, "inside"), "x");

    await writeFile(victim, "x");

    const oldDate = new Date(Date.now() - TEN_DAYS_MS);
    const { utimes } = await import("node:fs/promises");
    await utimes(blocker, oldDate, oldDate);
    await utimes(victim, oldDate, oldDate);

    await gcInboxMedia(SEVEN_DAYS_MS);

    expect(await Bun.file(victim).exists()).toBe(false);
    // blocker dir is still there — that's fine, we only care that the loop kept going.
    expect(await Bun.file(join(blocker, "inside")).exists()).toBe(true);
  });
});
