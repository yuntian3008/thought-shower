import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { homedir } from "os";

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

async function telegramApi(token: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { ok: boolean; result: unknown; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

const server = new Server(
  { name: "thought-shower-telegram", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_telegram",
      description: "Send a message to the active Telegram session topic.",
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

      await telegramApi(config.botToken, "sendMessage", {
        chat_id: config.groupId,
        text,
        message_thread_id: session.topicId,
        parse_mode: "Markdown",
      });
      return ok(`Sent to ${activeName}`);
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

      const result = (await telegramApi(config.botToken, "createForumTopic", {
        chat_id: config.groupId,
        name,
      })) as { message_thread_id: number; name: string };

      sessions[name] = {
        topicId: result.message_thread_id,
        topicName: result.name,
        createdAt: new Date().toISOString(),
      };
      await Bun.write(join(DATA_DIR, "sessions.json"), JSON.stringify(sessions, null, 2));
      await Bun.write(join(DATA_DIR, "active"), name);

      await telegramApi(config.botToken, "sendMessage", {
        chat_id: config.groupId,
        text: "Session started.",
        message_thread_id: result.message_thread_id,
      });

      return ok(`Created topic "${name}" (ID: ${result.message_thread_id})`);
    }

    return err(`Unknown tool: ${tool}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
});

await server.connect(new StdioServerTransport());
