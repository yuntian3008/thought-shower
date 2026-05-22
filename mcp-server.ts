import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";
import { TelegramBot } from "./scripts/telegram-bridge/telegram";
import {
  writePending,
  readResponse,
  removeResponse,
} from "./scripts/telegram-bridge/store";

const DATA_DIR = join(homedir(), ".claude", "thought-shower", "telegram-bridge");
const DAEMON_PATH = join(import.meta.dir, "scripts", "telegram-bridge", "daemon.ts");

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

async function loadConfig() {
  const file = Bun.file(join(DATA_DIR, "config.json"));
  if (!(await file.exists())) return null;
  return file.json();
}

async function loadSessions(): Promise<Record<string, { topicId: number; topicName: string; createdAt: string }>> {
  const file = Bun.file(join(DATA_DIR, "sessions.json"));
  if (!(await file.exists())) return {};
  return file.json();
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

async function resolveSession(sessionName: string) {
  const config = await loadConfig();
  if (!config) return { error: "Not configured. Run the setup CLI first." };

  const sessions = await loadSessions();
  const session = sessions[sessionName];
  if (!session) return { error: `Session "${sessionName}" not found. Use telegram_init first.` };

  return { config, session, sessionName };
}

const server = new Server(
  { name: "thought-shower-telegram", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_telegram",
      description: "Send a message to a Telegram session topic. Telegram renders Markdown (inline code, bold, italic, code blocks). Max 4096 chars per message — if the reply is longer, call this tool multiple times with self-contained sections.",
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
      description: "Ask the user a question via Telegram with inline button options. Blocks until the user taps a button. Use for decisions, confirmations, or choosing between approaches.",
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
      if ("error" in resolved) return err(resolved.error);

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
      if ("error" in resolved) return err(resolved.error);

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
      if ("error" in resolved) return err(resolved.error);

      const questionId = randomBytes(4).toString("hex");

      const lines = [];
      if (header) lines.push(`📋 *${header}*\n`);
      lines.push(question + "\n");
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        lines.push(`${i + 1}. *${opt.label}*${opt.description ? ` — ${opt.description}` : ""}`);
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

      await bot.sendMessage(config.groupId, "Session started.", result.message_thread_id);

      return ok(`Created topic "${name}" (ID: ${result.message_thread_id})`);
    }

    return err(`Unknown tool: ${tool}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
});

await server.connect(new StdioServerTransport());
