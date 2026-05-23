import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";
import { stat } from "node:fs/promises";
import { TelegramBot } from "./scripts/telegram-bridge/telegram";
import { escapeMarkdownV2 } from "./scripts/telegram-bridge/markdown";
import {
  writePending,
  readResponse,
  removeResponse,
  type Config,
  type SessionInfo,
} from "./scripts/telegram-bridge/store";

const DATA_DIR = join(homedir(), ".claude", "thought-shower", "telegram-bridge");
const DAEMON_PATH = join(import.meta.dir, "scripts", "telegram-bridge", "daemon.ts");

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const DOC_MAX_BYTES = 50 * 1024 * 1024;

export type PreCheckResult =
  | { ok: true; size: number }
  | { ok: false; error: string };

export async function preCheckMedia(
  path: string,
  maxBytes: number,
): Promise<PreCheckResult> {
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

const SESSION_PARAM = {
  type: "string",
  description: "Session name (worktree basename). Required — pass the name from telegram_init.",
} as const;

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

async function loadConfig(): Promise<Config | null> {
  const file = Bun.file(join(DATA_DIR, "config.json"));
  if (!(await file.exists())) return null;
  return file.json() as Promise<Config>;
}

async function loadSessions(): Promise<Record<string, SessionInfo>> {
  const file = Bun.file(join(DATA_DIR, "sessions.json"));
  if (!(await file.exists())) return {};
  return file.json() as Promise<Record<string, SessionInfo>>;
}

async function readPid(): Promise<number | null> {
  const file = Bun.file(join(DATA_DIR, "daemon.pid"));
  if (!(await file.exists())) return null;
  const val = (await file.text()).trim();
  return val ? Number(val) : null;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

type ResolveResult =
  | { ok: false; error: string }
  | { ok: true; config: Config; session: SessionInfo; sessionName: string };

async function resolveSession(sessionName: string): Promise<ResolveResult> {
  const config = await loadConfig();
  if (!config)
    return { ok: false, error: "Not configured. Run the setup CLI first." };

  const sessions = await loadSessions();
  const session = sessions[sessionName];
  if (!session)
    return {
      ok: false,
      error: `Session "${sessionName}" not found. Use telegram_init first.`,
    };

  return { ok: true, config, session, sessionName };
}

const server = new Server(
  { name: "thought-shower-telegram", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_telegram",
      description: "Send a message to a Telegram session topic. Text is rendered as Telegram MarkdownV2 — caller is responsible for escaping these 18 specials with a backslash if used as literal text: _ * [ ] ( ) ~ ` > # + - = | { } . ! \\. For plain prose, the safest path is to pre-escape all specials; for formatting, use *bold*, _italic_, `code`, and ```code blocks``` with their content properly escaped. Max 4096 chars per message — if the reply is longer, call this tool multiple times with self-contained sections.",
      inputSchema: {
        type: "object" as const,
        properties: {
          text: { type: "string", description: "The message text to send" },
          session: SESSION_PARAM,
        },
        required: ["text", "session"],
      },
    },
    {
      name: "telegram_daemon",
      description: "Manage the Telegram bridge daemon. Actions: start, stop, status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: { type: "string", enum: ["start", "stop", "status"] },
        },
        required: ["action"],
      },
    },
    {
      name: "telegram_seen",
      description: "React 👀 to a Telegram message to signal Claude is reading it. Pass the messageId from the Monitor notification.",
      inputSchema: {
        type: "object" as const,
        properties: {
          messageId: { type: "number", description: "The messageId from the inbox JSON line" },
          session: SESSION_PARAM,
        },
        required: ["messageId", "session"],
      },
    },
    {
      name: "ask_telegram",
      description: "Ask the user a question via Telegram with inline button options. Blocks until the user responds. User can tap a button OR type a free-text reply if none of the options fit. Use for decisions, confirmations, or choosing between approaches. Return value: { answer, index } — index is the option index for button taps, or -1 for free-text replies (with answer holding the typed text).",
      inputSchema: {
        type: "object" as const,
        properties: {
          question: { type: "string", description: "The question to ask" },
          header: { type: "string", description: "Short label shown above the question (e.g. 'Auth method', 'Approach')" },
          options: {
            type: "array",
            description: "2-4 options to choose from",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Button text (1-5 words)" },
                description: { type: "string", description: "Explanation shown in the message body" },
              },
              required: ["label"],
            },
          },
          session: SESSION_PARAM,
        },
        required: ["question", "options", "session"],
      },
    },
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
    {
      name: "telegram_init",
      description: "Create or reuse a Telegram topic for a session name.",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Session name (typically the worktree basename)" },
        },
        required: ["name"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name: tool, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    if (tool === "send_telegram") {
      const text = a.text as string;
      const sessionName = a.session as string;
      if (!text) return err("text is required");
      if (!sessionName) return err("session is required");

      const resolved = await resolveSession(sessionName);
      if (!resolved.ok) return err(resolved.error);

      const bot = new TelegramBot(resolved.config.botToken);
      await bot.sendMessage(resolved.config.groupId, text, resolved.session.topicId);
      return ok(`Sent to ${sessionName}`);
    }

    if (tool === "telegram_seen") {
      const messageId = a.messageId as number;
      const sessionName = a.session as string;
      if (!messageId) return err("messageId is required");
      if (!sessionName) return err("session is required");

      const resolved = await resolveSession(sessionName);
      if (!resolved.ok) return err(resolved.error);

      const bot = new TelegramBot(resolved.config.botToken);
      await bot.react(resolved.config.groupId, messageId, "👀");
      return ok("Seen");
    }

    if (tool === "ask_telegram") {
      const question = a.question as string;
      const header = (a.header as string) ?? "";
      const options = a.options as { label: string; description?: string }[];
      const sessionName = a.session as string;
      if (!question || !options?.length) return err("question and options are required");
      if (!sessionName) return err("session is required");

      const resolved = await resolveSession(sessionName);
      if (!resolved.ok) return err(resolved.error);

      const questionId = randomBytes(4).toString("hex");

      const lines = [];
      if (header) lines.push(`📋 *${escapeMarkdownV2(header)}*\n`);
      lines.push(escapeMarkdownV2(question) + "\n");
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const label = escapeMarkdownV2(opt.label);
        const desc = opt.description ? ` — ${escapeMarkdownV2(opt.description)}` : "";
        lines.push(`${i + 1}\\. *${label}*${desc}`);
      }

      const buttons = options.map((opt, i) => ({
        text: opt.label,
        callback_data: `ask:${questionId}:${i}`,
      }));
      const rows = buttons.length <= 3
        ? [buttons]
        : [buttons.slice(0, 2), buttons.slice(2)];

      const bot = new TelegramBot(resolved.config.botToken);
      const sent = await bot.sendQuestion(
        resolved.config.groupId,
        lines.join("\n"),
        rows,
        resolved.session.topicId,
      );

      await writePending(questionId, {
        chatId: resolved.config.groupId,
        messageId: sent.message_id,
        topicId: resolved.session.topicId,
        options,
        createdAt: Date.now(),
        mcpPid: process.pid,
      });

      while (true) {
        const response = await readResponse(questionId);
        if (response) {
          await removeResponse(questionId);
          return ok(JSON.stringify({ answer: response.label, index: response.index }));
        }
        await Bun.sleep(2000);
      }
    }

    if (tool === "telegram_daemon") {
      const action = a.action as string;

      if (action === "status") {
        const pid = await readPid();
        if (pid && isProcessAlive(pid)) return ok(`Running (pid ${pid})`);
        return ok("Not running");
      }

      if (action === "stop") {
        const pid = await readPid();
        if (!pid) return ok("Not running");
        try {
          process.kill(pid, "SIGTERM");
          return ok(`Stopped (pid ${pid})`);
        } catch {
          return ok("Not running (stale pid)");
        }
      }

      if (action === "start") {
        const pid = await readPid();
        if (pid && isProcessAlive(pid)) return ok(`Already running (pid ${pid})`);

        const { mkdir } = await import("node:fs/promises");
        await mkdir(DATA_DIR, { recursive: true });

        const proc = Bun.spawn(["bun", DAEMON_PATH], {
          stdout: "ignore",
          stderr: Bun.file(join(DATA_DIR, "daemon.log")),
          stdin: "ignore",
        });
        proc.unref();
        return ok(`Started (pid ${proc.pid})`);
      }

      return err(`Unknown action: ${action}`);
    }

    if (tool === "telegram_init") {
      const name = a.name as string;
      if (!name) return err("name is required");

      const config = await loadConfig();
      if (!config) return err("Not configured. Run the setup CLI first.");

      const sessions = await loadSessions();

      if (sessions[name]) {
        return ok(`Reusing topic "${sessions[name].topicName}" (ID: ${sessions[name].topicId})`);
      }

      const bot = new TelegramBot(config.botToken);
      const result = await bot.createForumTopic(config.groupId, name);

      sessions[name] = {
        topicId: result.message_thread_id,
        topicName: result.name,
        createdAt: new Date().toISOString(),
      };
      await Bun.write(join(DATA_DIR, "sessions.json"), JSON.stringify(sessions, null, 2));

      await bot.sendMessage(config.groupId, "Session started\\.", result.message_thread_id);

      return ok(`Created topic "${name}" (ID: ${result.message_thread_id})`);
    }

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

    return err(`Unknown tool: ${tool}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
});

await server.connect(new StdioServerTransport());
