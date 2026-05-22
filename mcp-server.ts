import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { homedir } from "os";
import { TelegramBot } from "./scripts/telegram-bridge/telegram";

const DATA_DIR = join(homedir(), ".claude", "thought-shower", "telegram-bridge");
const INBOX_DIR = join(DATA_DIR, "inbox");
const DAEMON_PATH = join(import.meta.dir, "scripts", "telegram-bridge", "daemon.ts");

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

async function getActive(): Promise<string | null> {
  const file = Bun.file(join(DATA_DIR, "active"));
  if (!(await file.exists())) return null;
  return (await file.text()).trim() || null;
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


const server = new Server(
  { name: "thought-shower-telegram", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_telegram",
      description: "Send a message to the active Telegram session topic. Telegram renders Markdown (inline code, bold, italic, code blocks). Max 4096 chars per message — if the reply is longer, call this tool multiple times with self-contained sections.",
      inputSchema: {
        type: "object" as const,
        properties: {
          text: { type: "string", description: "The message text to send" },
        },
        required: ["text"],
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
      description: "React ✅ to a Telegram message to signal it has been read. Pass the messageId from the Monitor notification.",
      inputSchema: {
        type: "object" as const,
        properties: {
          messageId: { type: "number", description: "The messageId from the inbox JSON line" },
        },
        required: ["messageId"],
      },
    },
    {
      name: "telegram_init",
      description: "Create or reuse a Telegram topic for a session name and set it as active.",
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
      if (!text) return err("text is required");

      const config = await loadConfig();
      if (!config) return err("Not configured. Run the setup CLI first.");

      const activeName = await getActive();
      if (!activeName) return err("No active session. Use telegram_init first.");

      const sessions = await loadSessions();
      const session = sessions[activeName];
      if (!session) return err(`Session "${activeName}" not found.`);

      const bot = new TelegramBot(config.botToken);
      await bot.sendMessage(config.groupId, text, session.topicId);
      return ok(`Sent to ${activeName}`);
    }

    if (tool === "telegram_seen") {
      const messageId = a.messageId as number;
      if (!messageId) return err("messageId is required");

      const config = await loadConfig();
      if (!config) return err("Not configured.");

      const bot = new TelegramBot(config.botToken);
      await bot.react(config.groupId, messageId, "✅");
      return ok("Seen");
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
        await Bun.write(join(DATA_DIR, "active"), name);
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
      await Bun.write(join(DATA_DIR, "active"), name);

      await bot.sendMessage(config.groupId, "Session started.", result.message_thread_id);

      return ok(`Created topic "${name}" (ID: ${result.message_thread_id})`);
    }

    return err(`Unknown tool: ${tool}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
});

await server.connect(new StdioServerTransport());
