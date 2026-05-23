# Telegram Multimedia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Telegram bridge so Claude can send and receive photos and documents through the same MCP server / daemon, with text-only messages still working unchanged.

**Architecture:** In-place extension of the existing bridge — new methods on `TelegramBot`, new MCP tools, an additive `media` field on the inbox JSON, and a 7-day GC for downloaded files that reuses the daemon's existing 5-minute timer. No new files outside `*.spec.ts` test files.

**Tech Stack:** Bun (runtime + test runner), TypeScript, Telegram Bot API (HTTP + multipart), `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-05-23-telegram-multimedia-design.md` (commit `c59652f`).

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `scripts/telegram-bridge/store.ts` | State paths + helpers; add media path + GC | Modify |
| `scripts/telegram-bridge/store.spec.ts` | Unit tests for media helpers | Create |
| `scripts/telegram-bridge/telegram.ts` | Telegram Bot API wrapper; add media methods + types | Modify |
| `scripts/telegram-bridge/telegram.spec.ts` | Unit tests for fetch / multipart call shape | Create |
| `scripts/telegram-bridge/daemon.ts` | Polling loop; wire media download + effective-text + GC | Modify |
| `scripts/telegram-bridge/daemon.spec.ts` | Unit tests on the extracted media-handler helper | Create |
| `mcp-server.ts` | MCP tool surface; add `send_photo` + `send_document` | Modify |
| `mcp-server.spec.ts` | Unit tests for pre-check rejections | Create |
| `README.md` | Mention new MCP tools + `inbox-media/` layout | Modify |
| `AGENTS.md` | Add new tool names to Telegram bridge block | Modify |
| `skills/telegram-on/SKILL.md` | Add one-sentence note about reading `media.path` | Modify |

Tests are colocated next to source files (matches `.agents/rules/testing.md`). Mocking strategy: where Bun's `mock.module` would leak across spec files, introduce a thin `<name>.deps.ts` bridge re-export and mock the bridge path (per `.agents/rules/testing.md`). This plan does not anticipate needing the bridge except possibly in `daemon.spec.ts`; the bridge is added only if a spec actually requires it.

---

### Task 1: store.ts — media path helpers + GC

**Files:**
- Modify: `scripts/telegram-bridge/store.ts`
- Create: `scripts/telegram-bridge/store.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/telegram-bridge/store.spec.ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
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
```

- [ ] **Step 2: Run tests, verify they fail**

```
bun test scripts/telegram-bridge/store.spec.ts
```

Expected: fails — `mediaPath`, `sanitizeFilename`, `gcInboxMedia`, `INBOX_MEDIA_DIR` not exported.

- [ ] **Step 3: Implement in store.ts**

Add to `scripts/telegram-bridge/store.ts`, after the existing `INBOX_DIR` declaration:

```ts
const INBOX_MEDIA_DIR = join(DATA_DIR, "inbox-media");
export { INBOX_MEDIA_DIR };

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\\0]/g, "")
    .replace(/^\.+/, "");
  return cleaned.length === 0 ? "file" : cleaned;
}

export function mediaPath(
  sessionName: string,
  messageId: number,
  ext?: string,
  filename?: string,
): string {
  const sess = sanitize(sessionName);
  const dir = join(INBOX_MEDIA_DIR, sess);
  if (filename !== undefined) {
    return join(dir, `${messageId}-${sanitizeFilename(filename)}`);
  }
  return join(dir, `${messageId}${ext ?? ".bin"}`);
}

export async function ensureMediaDir(sessionName: string): Promise<string> {
  const dir = join(INBOX_MEDIA_DIR, sanitize(sessionName));
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function gcInboxMedia(ttlMs: number): Promise<void> {
  const { readdir, unlink, stat: statFn } = await import("node:fs/promises");
  const sessions = await readdir(INBOX_MEDIA_DIR).catch(() => [] as string[]);
  const cutoff = Date.now() - ttlMs;
  for (const sess of sessions) {
    const dir = join(INBOX_MEDIA_DIR, sess);
    const files = await readdir(dir).catch(() => [] as string[]);
    for (const f of files) {
      const p = join(dir, f);
      try {
        const s = await statFn(p);
        if (s.mtimeMs < cutoff) await unlink(p);
      } catch {
        // best-effort per-file
      }
    }
  }
}
```

(`sanitize` already exists at the bottom of store.ts — reuse it.)

- [ ] **Step 4: Run tests, verify they pass**

```
bun test scripts/telegram-bridge/store.spec.ts
```

Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add scripts/telegram-bridge/store.ts scripts/telegram-bridge/store.spec.ts
git commit -m "feat(telegram-bridge): add inbox-media path helpers and 7d GC"
```

---

### Task 2: telegram.ts — types + getFile + downloadFile

**Files:**
- Modify: `scripts/telegram-bridge/telegram.ts`
- Create: `scripts/telegram-bridge/telegram.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/telegram-bridge/telegram.spec.ts
import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { join } from "path";
import { rm, readFile } from "node:fs/promises";
import { TelegramBot } from "./telegram";

const originalFetch = globalThis.fetch;

describe("TelegramBot.getFile", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("should call Telegram getFile and return file_path", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (..._args: unknown[]) => {
      calls.push(String(_args[0]));
      return new Response(
        JSON.stringify({ ok: true, result: { file_path: "photos/abc.jpg" } }),
      );
    }) as unknown as typeof fetch;

    const bot = new TelegramBot("TOKEN");
    const result = await bot.getFile("FILEID");
    expect(result.file_path).toBe("photos/abc.jpg");
    expect(calls[0]).toContain("/botTOKEN/getFile");
  });
});

describe("TelegramBot.downloadFile", () => {
  const TMP = join(import.meta.dir, "..", "..", ".tmp-telegram-spec");

  beforeEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  test("should GET file URL and write bytes to dest", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch = mock(async (..._args: unknown[]) => {
      return new Response(bytes);
    }) as unknown as typeof fetch;

    const bot = new TelegramBot("TOKEN");
    const dest = join(TMP, "out.bin");
    await bot.downloadFile("photos/abc.jpg", dest);

    const written = await readFile(dest);
    expect(written.length).toBe(4);
    expect(written[0]).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```
bun test scripts/telegram-bridge/telegram.spec.ts
```

Expected: fails — `getFile`, `downloadFile` not defined on `TelegramBot`.

- [ ] **Step 3: Extend TgMessage types and implement the two methods**

In `scripts/telegram-bridge/telegram.ts`:

Replace the `TgMessage` interface with:

```ts
export interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  message_thread_id?: number;
  from?: { id: number; first_name: string; username?: string; is_bot?: boolean };
  chat: { id: number; title?: string; type: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: PhotoSize[];
  document?: TgDocument;
}
```

Add two new methods inside the `TelegramBot` class (after `createForumTopic`):

```ts
async getFile(fileId: string) {
  return this.call<{ file_id: string; file_path?: string }>("getFile", {
    file_id: fileId,
  });
}

async downloadFile(filePath: string, destPath: string): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("path");
  await mkdir(dirname(destPath), { recursive: true });
  // Note: file URL uses /file/bot<TOKEN>/, not /bot<TOKEN>/.
  const fileUrl = this.url.replace("/bot", "/file/bot") + "/" + filePath;
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`downloadFile ${res.status}: ${await res.text()}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(destPath, buf);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```
bun test scripts/telegram-bridge/telegram.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/telegram-bridge/telegram.ts scripts/telegram-bridge/telegram.spec.ts
git commit -m "feat(telegram-bridge): add getFile + downloadFile and extend TgMessage types"
```

---

### Task 3: telegram.ts — sendPhoto + sendDocument

**Files:**
- Modify: `scripts/telegram-bridge/telegram.ts`
- Modify: `scripts/telegram-bridge/telegram.spec.ts`

- [ ] **Step 1: Add failing tests for the two methods**

Append to `scripts/telegram-bridge/telegram.spec.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("TelegramBot.sendPhoto", () => {
  const TMP = join(tmpdir(), "thought-shower-tg-spec");
  let photoPath: string;

  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
    photoPath = join(TMP, "p.jpg");
    await writeFile(photoPath, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  });
  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  test("should POST multipart to sendPhoto with chat_id + thread + caption", async () => {
    let capturedUrl = "";
    let capturedBody: FormData | undefined;
    globalThis.fetch = mock(async (..._args: unknown[]) => {
      capturedUrl = String(_args[0]);
      capturedBody = (_args[1] as RequestInit | undefined)?.body as FormData;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    }) as unknown as typeof fetch;

    const bot = new TelegramBot("TOKEN");
    await bot.sendPhoto(-100, photoPath, "hello", 5);

    expect(capturedUrl).toContain("/botTOKEN/sendPhoto");
    expect(capturedBody?.get("chat_id")).toBe("-100");
    expect(capturedBody?.get("caption")).toBe("hello");
    expect(capturedBody?.get("message_thread_id")).toBe("5");
    expect(capturedBody?.get("photo")).toBeInstanceOf(File);
  });
});

describe("TelegramBot.sendDocument", () => {
  const TMP = join(tmpdir(), "thought-shower-tg-spec-doc");
  let docPath: string;

  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
    docPath = join(TMP, "r.pdf");
    await writeFile(docPath, "%PDF-1.4\n");
  });
  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  test("should POST multipart to sendDocument with optional filename override", async () => {
    let capturedBody: FormData | undefined;
    globalThis.fetch = mock(async (..._args: unknown[]) => {
      capturedBody = (_args[1] as RequestInit | undefined)?.body as FormData;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    }) as unknown as typeof fetch;

    const bot = new TelegramBot("TOKEN");
    await bot.sendDocument(-100, docPath, undefined, undefined, "renamed.pdf");

    const file = capturedBody?.get("document") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("renamed.pdf");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```
bun test scripts/telegram-bridge/telegram.spec.ts
```

Expected: fails — `sendPhoto`, `sendDocument` not defined.

- [ ] **Step 3: Implement in telegram.ts**

Add inside the `TelegramBot` class:

```ts
async sendPhoto(
  chatId: number,
  localPath: string,
  caption?: string,
  topicId?: number,
) {
  const form = await this.buildMediaForm(chatId, "photo", localPath, caption, topicId);
  return this.callForm<TgMessage>("sendPhoto", form);
}

async sendDocument(
  chatId: number,
  localPath: string,
  caption?: string,
  topicId?: number,
  filename?: string,
) {
  const form = await this.buildMediaForm(
    chatId,
    "document",
    localPath,
    caption,
    topicId,
    filename,
  );
  return this.callForm<TgMessage>("sendDocument", form);
}

private async buildMediaForm(
  chatId: number,
  field: "photo" | "document",
  localPath: string,
  caption: string | undefined,
  topicId: number | undefined,
  filename?: string,
): Promise<FormData> {
  const { basename } = await import("path");
  const file = Bun.file(localPath);
  const name = filename ?? basename(localPath);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (topicId !== undefined) form.append("message_thread_id", String(topicId));
  if (caption !== undefined) form.append("caption", caption);
  form.append(field, file, name);
  return form;
}

private async callForm<T>(method: string, form: FormData): Promise<T> {
  const res = await fetch(`${this.url}/${method}`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as {
    ok: boolean;
    result: T;
    description?: string;
  };
  if (!data.ok) {
    throw new Error(`Telegram ${method}: ${data.description}`);
  }
  return data.result;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```
bun test scripts/telegram-bridge/telegram.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/telegram-bridge/telegram.ts scripts/telegram-bridge/telegram.spec.ts
git commit -m "feat(telegram-bridge): add sendPhoto and sendDocument multipart methods"
```

---

### Task 4: mcp-server.ts — send_photo + send_document tools with pre-check

**Files:**
- Modify: `mcp-server.ts`
- Create: `mcp-server.spec.ts`

- [ ] **Step 1: Write failing tests for the pre-check helper**

The tests target a small pure helper `preCheckMedia(path, maxBytes)` extracted from the tool handlers. Put both the helper and the handlers in `mcp-server.ts`.

```ts
// mcp-server.spec.ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "node:os";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { preCheckMedia } from "./mcp-server";

const TMP = join(tmpdir(), "thought-shower-mcp-spec");

describe("preCheckMedia", () => {
  beforeEach(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(TMP, { recursive: true });
  });
  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  test("should reject missing path", async () => {
    const result = await preCheckMedia(join(TMP, "no.bin"), 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
  });

  test("should reject oversize file", async () => {
    const p = join(TMP, "big.bin");
    await writeFile(p, new Uint8Array(2000));
    const result = await preCheckMedia(p, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
  });

  test("should accept a regular file under the limit", async () => {
    const p = join(TMP, "ok.bin");
    await writeFile(p, new Uint8Array(500));
    const result = await preCheckMedia(p, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.size).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```
bun test mcp-server.spec.ts
```

Expected: fails — `preCheckMedia` not exported.

- [ ] **Step 3: Add the helper, two tools, and the dispatch**

Add near the top of `mcp-server.ts`, after the existing constants:

```ts
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const DOC_MAX_BYTES = 50 * 1024 * 1024;

export type PreCheckResult =
  | { ok: true; size: number }
  | { ok: false; error: string };

export async function preCheckMedia(
  path: string,
  maxBytes: number,
): Promise<PreCheckResult> {
  const { stat } = await import("node:fs/promises");
  let st;
  try {
    st = await stat(path);
  } catch {
    return { ok: false, error: `File not found: ${path}` };
  }
  if (!st.isFile()) {
    return { ok: false, error: `Not a regular file: ${path}` };
  }
  if (st.size > maxBytes) {
    return {
      ok: false,
      error: `File too large: ${st.size} bytes (max ${maxBytes})`,
    };
  }
  return { ok: true, size: st.size };
}
```

In the `ListToolsRequestSchema` handler, add two new tool entries (immediately after the existing `ask_telegram` block, keeping descriptions terse — these ride in the system prompt every conversation):

```ts
{
  name: "send_photo",
  description: "Send a local photo file to the Telegram session topic. Max 10 MB.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      caption: { type: "string" },
      session: SESSION_PARAM,
    },
    required: ["path", "session"],
  },
},
{
  name: "send_document",
  description: "Send a local file as a Telegram document to the session topic. Max 50 MB.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string" },
      caption: { type: "string" },
      filename: { type: "string" },
      session: SESSION_PARAM,
    },
    required: ["path", "session"],
  },
},
```

In the `CallToolRequestSchema` handler, add two new branches before the final `return err(\`Unknown tool: ${tool}\`);`:

```ts
if (tool === "send_photo") {
  const path = a.path as string;
  const caption = a.caption as string | undefined;
  const sessionName = a.session as string;
  if (!path) return err("path is required");
  if (!sessionName) return err("session is required");

  const pre = await preCheckMedia(path, PHOTO_MAX_BYTES);
  if (!pre.ok) return err(pre.error);

  const resolved = await resolveSession(sessionName);
  if (!resolved.ok) return err(resolved.error);

  const bot = new TelegramBot(resolved.config.botToken);
  await bot.sendPhoto(
    resolved.config.groupId,
    path,
    caption,
    resolved.session.topicId,
  );
  return ok(`Photo sent (${pre.size} bytes)`);
}

if (tool === "send_document") {
  const path = a.path as string;
  const caption = a.caption as string | undefined;
  const filename = a.filename as string | undefined;
  const sessionName = a.session as string;
  if (!path) return err("path is required");
  if (!sessionName) return err("session is required");

  const pre = await preCheckMedia(path, DOC_MAX_BYTES);
  if (!pre.ok) return err(pre.error);

  const resolved = await resolveSession(sessionName);
  if (!resolved.ok) return err(resolved.error);

  const bot = new TelegramBot(resolved.config.botToken);
  await bot.sendDocument(
    resolved.config.groupId,
    path,
    caption,
    resolved.session.topicId,
    filename,
  );
  const sentName = filename ?? path.split("/").pop() ?? path;
  return ok(`Document sent (${pre.size} bytes, name=${sentName})`);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```
bun test mcp-server.spec.ts
bunx tsc --noEmit
```

Expected: tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add mcp-server.ts mcp-server.spec.ts
git commit -m "feat(mcp-server): add send_photo and send_document tools with size pre-check"
```

---

### Task 5: daemon.ts — extract media handler + effective-text helper

This is a refactor that pulls the new logic into pure, testable helpers before wiring them into the daemon loop in Task 6.

**Files:**
- Modify: `scripts/telegram-bridge/daemon.ts`
- Create: `scripts/telegram-bridge/daemon.spec.ts`

- [ ] **Step 1: Write failing tests for the helpers**

```ts
// scripts/telegram-bridge/daemon.spec.ts
import { test, expect, describe } from "bun:test";
import {
  effectiveText,
  pickPhotoExt,
  pickPhoto,
} from "./daemon";
import type { TgMessage, PhotoSize } from "./telegram";

describe("effectiveText", () => {
  test("should prefer msg.text", () => {
    const m = { text: "hi", caption: "cap" } as TgMessage;
    expect(effectiveText(m)).toBe("hi");
  });

  test("should fall back to msg.caption", () => {
    const m = { caption: "cap" } as TgMessage;
    expect(effectiveText(m)).toBe("cap");
  });

  test("should return empty string when neither present", () => {
    const m = {} as TgMessage;
    expect(effectiveText(m)).toBe("");
  });
});

describe("pickPhotoExt", () => {
  test("should map known mime types", () => {
    expect(pickPhotoExt("image/jpeg")).toBe(".jpg");
    expect(pickPhotoExt("image/png")).toBe(".png");
    expect(pickPhotoExt("image/webp")).toBe(".webp");
  });

  test("should fall back to .jpg for unknown or missing mime", () => {
    expect(pickPhotoExt(undefined)).toBe(".jpg");
    expect(pickPhotoExt("application/octet-stream")).toBe(".jpg");
  });
});

describe("pickPhoto", () => {
  test("should pick the largest PhotoSize (last in array per Telegram convention)", () => {
    const photos: PhotoSize[] = [
      { file_id: "a", file_unique_id: "ua", width: 90, height: 90 },
      { file_id: "b", file_unique_id: "ub", width: 320, height: 320 },
      { file_id: "c", file_unique_id: "uc", width: 1280, height: 1280 },
    ];
    expect(pickPhoto(photos)?.file_id).toBe("c");
  });

  test("should return null when array is empty or undefined", () => {
    expect(pickPhoto(undefined)).toBe(null);
    expect(pickPhoto([])).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```
bun test scripts/telegram-bridge/daemon.spec.ts
```

Expected: fails — exports not found.

- [ ] **Step 3: Add the helpers as named exports in daemon.ts**

Insert near the top of `scripts/telegram-bridge/daemon.ts`, after the existing imports and before `GC_INTERVAL_MS`:

```ts
import type { TgMessage, PhotoSize } from "./telegram";

const MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function effectiveText(msg: TgMessage): string {
  return msg.text ?? msg.caption ?? "";
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function pickPhotoExt(mime: string | undefined): string {
  if (!mime) return ".jpg";
  return MIME_EXT[mime] ?? ".jpg";
}

export function pickPhoto(sizes: PhotoSize[] | undefined): PhotoSize | null {
  if (!sizes || sizes.length === 0) return null;
  return sizes[sizes.length - 1];
}
```

- [ ] **Step 4: Run tests, verify they pass**

```
bun test scripts/telegram-bridge/daemon.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/telegram-bridge/daemon.ts scripts/telegram-bridge/daemon.spec.ts
git commit -m "refactor(telegram-bridge): extract effectiveText / pickPhoto / pickPhotoExt helpers"
```

---

### Task 6: daemon.ts — wire media download, free-text-answer caption, GC

**Files:**
- Modify: `scripts/telegram-bridge/daemon.ts`

No new spec file — coverage comes from the helpers in Task 5 plus the manual verification in Task 8.

- [ ] **Step 1: Replace the message-handling block with the media-aware version**

In `scripts/telegram-bridge/daemon.ts`, change three things:

**A.** Add `ensureMediaDir`, `gcInboxMedia`, `mediaPath`, `sanitizeFilename` to the existing store import block at the top of the file:

```ts
import {
  appendInbox,
  ensureDirs,
  ensureMediaDir,
  gcInboxMedia,
  getOffset,
  isProcessAlive,
  listPending,
  loadConfig,
  loadSessions,
  mediaPath,
  readPending,
  removePending,
  removePid,
  sanitizeFilename,
  saveOffset,
  writePid,
  writeResponse,
} from "./store";
```

**B.** Replace the existing message-handling section (currently `scripts/telegram-bridge/daemon.ts:117-171`, starting at `const msg = u.message;` through the `bot.react(...).catch(() => {});` that follows the inbox append) with:

```ts
const msg = u.message;
if (!msg) continue;
if (msg.chat.id !== config.groupId) continue;
if (!msg.message_thread_id) continue;
if (msg.from?.id === config.botId) continue;
if (msg.from?.id !== config.allowedUserId) continue;

const sessionName = topicToSession.get(msg.message_thread_id);
if (!sessionName) continue;

// Download photo/document if present; null on miss or failure.
let mediaInfo: {
  type: "photo" | "document";
  path: string;
  mime: string;
  size: number;
  filename: string | null;
} | null = null;

const photo = pickPhoto(msg.photo);
if (photo) {
  try {
    const dir = await ensureMediaDir(sessionName);
    const fileMeta = await bot.getFile(photo.file_id);
    if (!fileMeta.file_path) throw new Error("file_path missing");
    const ext = pickPhotoExt(undefined); // Telegram photos rarely expose mime here; default .jpg
    const dest = mediaPath(sessionName, msg.message_id, ext);
    await bot.downloadFile(fileMeta.file_path, dest);
    mediaInfo = {
      type: "photo",
      path: dest,
      mime: "image/jpeg",
      size: photo.file_size ?? 0,
      filename: null,
    };
    void dir; // silence unused
  } catch (e) {
    console.error(`[telegram-bridge] photo download failed: ${e}`);
  }
} else if (msg.document) {
  try {
    await ensureMediaDir(sessionName);
    const fileMeta = await bot.getFile(msg.document.file_id);
    if (!fileMeta.file_path) throw new Error("file_path missing");
    const dest = mediaPath(
      sessionName,
      msg.message_id,
      undefined,
      msg.document.file_name ?? "file",
    );
    await bot.downloadFile(fileMeta.file_path, dest);
    mediaInfo = {
      type: "document",
      path: dest,
      mime: msg.document.mime_type ?? "application/octet-stream",
      size: msg.document.file_size ?? 0,
      filename: msg.document.file_name ?? null,
    };
  } catch (e) {
    console.error(`[telegram-bridge] document download failed: ${e}`);
  }
}

const text = effectiveText(msg);
const msgTimestampMs = msg.date * 1000;
const pendings = await listPending();
const matched = pendings
  .filter(
    (p) =>
      p.data.topicId === msg.message_thread_id &&
      p.data.createdAt < msgTimestampMs,
  )
  .sort((a, b) => a.data.createdAt - b.data.createdAt)[0];

if (matched && text) {
  const preview = truncate(text, FREE_TEXT_PREVIEW_MAX);
  await writeResponse(matched.id, {
    label: text,
    index: -1,
    timestamp: Date.now(),
  });
  await removePending(matched.id);
  bot
    .editMessageText(
      matched.data.chatId,
      matched.data.messageId,
      `✅ 💬 ${escapeMarkdownV2(preview)}`,
    )
    .catch(() => {});
  bot.react(config.groupId, msg.message_id, "👌").catch(() => {});
  console.error(
    `[telegram-bridge] free-text answer: ${matched.id} → ${preview}`,
  );
  continue;
}

const line = JSON.stringify({
  from: msg.from?.first_name ?? "Unknown",
  text: text || (mediaInfo ? "" : "[non-text]"),
  ts: msg.date,
  messageId: msg.message_id,
  ...(mediaInfo ? { media: mediaInfo } : {}),
});

await appendInbox(sessionName, line);
bot.react(config.groupId, msg.message_id, "👌").catch(() => {});
console.error(
  `[telegram-bridge] [${sessionName}] ${msg.from?.first_name}: ${text || (mediaInfo ? `<${mediaInfo.type}>` : "[non-text]")}`,
);
```

Note: `sanitizeFilename` is used implicitly through `mediaPath`; remove it from the import list above if your linter flags it as unused.

**C.** Add `gcInboxMedia` to the GC tick. Change the existing `setInterval` block:

```ts
const gcTimer = setInterval(() => {
  gcOrphanPendings(bot).catch((e) =>
    console.error(`[telegram-bridge] gc error: ${e}`),
  );
  gcInboxMedia(MEDIA_TTL_MS).catch((e) =>
    console.error(`[telegram-bridge] gc media error: ${e}`),
  );
}, GC_INTERVAL_MS);
```

- [ ] **Step 2: Run typecheck + all specs**

```
bunx tsc --noEmit
bun test
```

Expected: tsc clean, all spec files PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/telegram-bridge/daemon.ts
git commit -m "feat(telegram-bridge): handle inbound media + caption answers + media GC in daemon"
```

---

### Task 7: Docs — README, AGENTS, telegram-on skill

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `skills/telegram-on/SKILL.md`

- [ ] **Step 1: Update README.md**

Find the Telegram bridge section (or the closest existing list of MCP tools / skills) and add two bullet points under the MCP tools listing:

```
- `send_photo` — send a local photo file (≤10 MB) to the session topic.
- `send_document` — send a local file (≤50 MB) to the session topic as a Telegram document.
```

If README has a layout / state-dir block, add a line mentioning `inbox-media/<session>/` next to the existing `inbox/<session>.jsonl` entry.

- [ ] **Step 2: Update AGENTS.md**

In the "Telegram bridge (MCP server)" paragraph (`AGENTS.md:115`), change the tool list:

```
`mcp-server.ts` exposes MCP tools (`send_telegram`, `send_photo`, `send_document`, `ask_telegram`, `telegram_init`, `telegram_daemon`, `telegram_seen`) backed by a long-running daemon (`scripts/telegram-bridge/daemon.ts`). State lives at `~/.claude/thought-shower/telegram-bridge/` — outside the plugin cache so it survives updates. Sessions are keyed by worktree basename. Inbound photos and documents are downloaded into `inbox-media/<session>/` (TTL 7 days) and surfaced to the agent via an optional `media` field in the inbox JSONL line.
```

- [ ] **Step 3: Update skills/telegram-on/SKILL.md**

In step 7 ("Handle incoming messages"), after the existing JSON example, add one paragraph:

```
If the JSON line includes an optional `media: {type, path, mime, size, filename}` field, read the file at `media.path` (use the `Read` tool — it handles images, PDFs, and text) before responding. The local file is auto-deleted 7 days after receipt.
```

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md skills/telegram-on/SKILL.md
git commit -m "docs: document send_photo / send_document and inbox-media handling"
```

---

### Task 8: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Restart the daemon**

```bash
bun -e 'import("./mcp-server").then(async () => { /* not used */ })' >/dev/null 2>&1 || true
# Stop existing daemon via MCP if running, then start fresh:
# From any Claude Code session attached to this MCP:
#   telegram_daemon action=stop
#   telegram_daemon action=start
```

If running outside an MCP session, kill the existing daemon process by reading its pid:

```bash
PID=$(cat ~/.claude/thought-shower/telegram-bridge/daemon.pid 2>/dev/null)
if [ -n "$PID" ]; then kill "$PID" || true; fi
bun scripts/telegram-bridge/daemon.ts &  # detach as your shell allows
```

- [ ] **Step 2: Send a photo from your phone to the bot topic, verify inbox**

```bash
tail -n 1 ~/.claude/thought-shower/telegram-bridge/inbox/thought-shower.jsonl
```

Expected: a JSON line with a `media: {type: "photo", path: ".../inbox-media/thought-shower/<msgId>.jpg", ...}` field. The file at `media.path` exists.

```bash
ls ~/.claude/thought-shower/telegram-bridge/inbox-media/thought-shower/
```

- [ ] **Step 3: Send a document from your phone, verify inbox**

Same check as Step 2, but inbox JSON `media.type` should be `"document"` and `media.filename` should match the file you sent.

- [ ] **Step 4: Test send_photo from MCP**

Pick a small image file on disk (e.g. screenshot in `~/Desktop`):

```
# Via MCP from any Claude session:
send_photo path="/Users/thien/Desktop/test.png" caption="hello" session="thought-shower"
```

Expected: photo appears in the Telegram topic. MCP returns `Photo sent (<size> bytes)`.

- [ ] **Step 5: Test send_document from MCP**

```
send_document path="docs/superpowers/specs/2026-05-23-telegram-multimedia-design.md" session="thought-shower"
```

Expected: spec file appears in the Telegram topic as an attachment. MCP returns `Document sent (<size> bytes, name=2026-05-23-telegram-multimedia-design.md)`.

- [ ] **Step 6: Test oversize rejection**

```bash
dd if=/dev/zero of=/tmp/big.bin bs=1M count=11
```

Then via MCP:

```
send_photo path="/tmp/big.bin" session="thought-shower"
```

Expected: MCP error `File too large: ... (max 10485760)`. No upload attempt.

```bash
rm /tmp/big.bin
```

- [ ] **Step 7: Verify GC works (sanity check, not full TTL)**

```bash
# Temporarily backdate one media file by 8 days, restart daemon, wait one tick.
F=$(ls ~/.claude/thought-shower/telegram-bridge/inbox-media/thought-shower/ | head -1)
touch -t $(date -v-8d +%Y%m%d%H%M.%S) ~/.claude/thought-shower/telegram-bridge/inbox-media/thought-shower/"$F"
# wait ≥5 minutes for GC tick, then:
ls ~/.claude/thought-shower/telegram-bridge/inbox-media/thought-shower/"$F" 2>&1
```

Expected: file no longer exists.

- [ ] **Step 8: Final typecheck + full test sweep**

```bash
bunx tsc --noEmit
bun test
```

Expected: clean.

---

## Self-review notes

- Spec coverage:
  - Outbound photo/document → Tasks 3 + 4.
  - Inbound download → Tasks 1 (path) + 2 (download) + 5 (helpers) + 6 (wiring).
  - GC → Task 1 (logic) + Task 6 (timer integration).
  - Caption-as-answer → Task 5 (`effectiveText`) + Task 6 (wiring).
  - Inbox JSON additive `media` field → Task 6.
  - Pre-check rejections → Task 4.
  - Doc updates → Task 7.
  - Manual verification → Task 8.
- Type consistency:
  - `mediaPath(session, msgId, ext?, filename?)` — same signature in Task 1 (definition) and Task 6 (call site).
  - `preCheckMedia` returns `{ok:true,size} | {ok:false,error}` — Task 4 test, helper, and call site agree.
  - `effectiveText`, `pickPhoto`, `pickPhotoExt` exported from `daemon.ts` — Task 5 defines, Task 6 imports.
- Token efficiency (per spec):
  - New MCP tool descriptions kept to one terse line each.
  - No new MCP tool for download (daemon handles inbound transparently).
  - No new file in `scripts/telegram-bridge/` beyond tests.
  - GC reuses the existing 5-minute timer.
  - Inbox JSON omits `media` entirely when absent.
