import { join } from "path";
import { homedir } from "os";
import { mkdir } from "node:fs/promises";

const DATA_DIR = join(homedir(), ".claude", "thought-shower", "telegram-bridge");
const INBOX_DIR = join(DATA_DIR, "inbox");
const INBOX_MEDIA_DIR = join(DATA_DIR, "inbox-media");

export { DATA_DIR, INBOX_DIR, INBOX_MEDIA_DIR };

export interface Config {
  botToken: string;
  groupId: number;
  botId: number;
  allowedUserId: number;
}

export interface SessionInfo {
  topicId: number;
  topicName: string;
  createdAt: string;
}

export async function ensureDirs() {
  await mkdir(INBOX_DIR, { recursive: true });
}

// --- Config ---

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(join(DATA_DIR, "config.json"));
  if (!(await file.exists())) {
    throw new Error(
      "Not configured. Run: bun cli.ts setup --token <T> --group <G> --user <U>",
    );
  }
  return file.json();
}

export async function saveConfig(config: Config) {
  await ensureDirs();
  await Bun.write(join(DATA_DIR, "config.json"), JSON.stringify(config, null, 2));
}

// --- Sessions ---

export async function loadSessions(): Promise<Record<string, SessionInfo>> {
  const file = Bun.file(join(DATA_DIR, "sessions.json"));
  if (!(await file.exists())) return {};
  return file.json();
}

export async function saveSession(name: string, info: SessionInfo) {
  const sessions = await loadSessions();
  sessions[name] = info;
  await Bun.write(
    join(DATA_DIR, "sessions.json"),
    JSON.stringify(sessions, null, 2),
  );
}

// --- Active session ---

export async function getActive(): Promise<string | null> {
  const file = Bun.file(join(DATA_DIR, "active"));
  if (!(await file.exists())) return null;
  return (await file.text()).trim();
}

export async function setActive(name: string) {
  await Bun.write(join(DATA_DIR, "active"), name);
}

// --- Offset ---

export async function getOffset(): Promise<number | undefined> {
  const file = Bun.file(join(DATA_DIR, "offset"));
  if (!(await file.exists())) return undefined;
  const val = (await file.text()).trim();
  return val ? Number(val) : undefined;
}

export async function saveOffset(offset: number) {
  await Bun.write(join(DATA_DIR, "offset"), String(offset));
}

// --- Inbox ---

const MAX_INBOX_LINES = 100;

export async function appendInbox(sessionName: string, line: string) {
  await ensureDirs();
  const path = join(INBOX_DIR, `${sanitize(sessionName)}.jsonl`);
  const file = Bun.file(path);
  const existing = (await file.exists()) ? await file.text() : "";
  const lines = (existing + line + "\n").split("\n").filter(Boolean);
  const trimmed =
    lines.length > MAX_INBOX_LINES ? lines.slice(-MAX_INBOX_LINES) : lines;
  await Bun.write(path, trimmed.join("\n") + "\n");
}

export function inboxPath(sessionName: string): string {
  return join(INBOX_DIR, `${sanitize(sessionName)}.jsonl`);
}

// --- PID ---

export async function writePid(pid: number) {
  await Bun.write(join(DATA_DIR, "daemon.pid"), String(pid));
}

export async function readPid(): Promise<number | null> {
  const file = Bun.file(join(DATA_DIR, "daemon.pid"));
  if (!(await file.exists())) return null;
  const val = (await file.text()).trim();
  return val ? Number(val) : null;
}

export async function removePid() {
  const path = join(DATA_DIR, "daemon.pid");
  const file = Bun.file(path);
  if (await file.exists()) {
    const { unlink } = await import("node:fs/promises");
    await unlink(path);
  }
}

export async function isDaemonRunning(): Promise<boolean> {
  const pid = await readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// --- Questions (ask_telegram IPC) ---

const PENDING_DIR = join(DATA_DIR, "pending");
const RESPONSES_DIR = join(DATA_DIR, "responses");

export { PENDING_DIR, RESPONSES_DIR };

export interface PendingQuestion {
  chatId: number;
  messageId: number;
  topicId: number;
  options: { label: string; description?: string }[];
  createdAt: number;
  mcpPid: number;
}

export async function writePending(id: string, data: PendingQuestion) {
  await mkdir(PENDING_DIR, { recursive: true });
  await Bun.write(join(PENDING_DIR, `${id}.json`), JSON.stringify(data));
}

export async function readPending(id: string): Promise<PendingQuestion | null> {
  const file = Bun.file(join(PENDING_DIR, `${id}.json`));
  if (!(await file.exists())) return null;
  return file.json();
}

export async function removePending(id: string) {
  const { unlink } = await import("node:fs/promises");
  await unlink(join(PENDING_DIR, `${id}.json`)).catch(() => {});
}

export async function listPending(): Promise<
  { id: string; data: PendingQuestion }[]
> {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(PENDING_DIR).catch(() => [] as string[]);
  const results: { id: string; data: PendingQuestion }[] = [];
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const data = await readPending(id);
    if (data) results.push({ id, data });
  }
  return results;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface QuestionResponse {
  label: string;
  index: number;
  timestamp: number;
}

export async function writeResponse(id: string, data: QuestionResponse) {
  await mkdir(RESPONSES_DIR, { recursive: true });
  await Bun.write(join(RESPONSES_DIR, `${id}.json`), JSON.stringify(data));
}

export async function readResponse(id: string): Promise<QuestionResponse | null> {
  const file = Bun.file(join(RESPONSES_DIR, `${id}.json`));
  if (!(await file.exists())) return null;
  return file.json();
}

export async function removeResponse(id: string) {
  const { unlink } = await import("node:fs/promises");
  await unlink(join(RESPONSES_DIR, `${id}.json`)).catch(() => {});
}

// --- Media path helpers ---

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[/\\\0]/g, "").replace(/^\.+/, "");
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

// --- Helpers ---

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
