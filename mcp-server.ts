import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { join } from "path";
import { homedir } from "os";

const DATA_DIR = join(homedir(), ".claude", "thought-shower", "telegram-bridge");

async function loadConfig() {
  const file = Bun.file(join(DATA_DIR, "config.json"));
  if (!(await file.exists())) return null;
  return file.json();
}

async function getActiveTopicId(): Promise<{
  topicId: number;
  sessionName: string;
} | null> {
  const activeFile = Bun.file(join(DATA_DIR, "active"));
  if (!(await activeFile.exists())) return null;
  const sessionName = (await activeFile.text()).trim();
  if (!sessionName) return null;

  const sessionsFile = Bun.file(join(DATA_DIR, "sessions.json"));
  if (!(await sessionsFile.exists())) return null;
  const sessions = await sessionsFile.json();
  const session = sessions[sessionName];
  if (!session) return null;

  return { topicId: session.topicId, sessionName };
}

const server = new Server(
  { name: "thought-shower-telegram", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_telegram",
      description:
        "Send a message to the active Telegram session topic. Use this to reply to messages received via the Telegram bridge Monitor.",
      inputSchema: {
        type: "object" as const,
        properties: {
          text: {
            type: "string",
            description: "The message text to send",
          },
        },
        required: ["text"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "send_telegram") {
    const text = (args as Record<string, unknown>).text as string;
    if (!text) {
      return {
        content: [{ type: "text" as const, text: "text is required" }],
        isError: true,
      };
    }

    const config = await loadConfig();
    if (!config) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Telegram bridge not configured. Run: bun cli.ts setup",
          },
        ],
        isError: true,
      };
    }

    const active = await getActiveTopicId();
    if (!active) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No active session. Run: bun cli.ts init --name <name>",
          },
        ],
        isError: true,
      };
    }

    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.groupId,
          text,
          message_thread_id: active.topicId,
        }),
      },
    );
    const data = (await res.json()) as {
      ok: boolean;
      description?: string;
    };

    if (!data.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Telegram error: ${data.description}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Sent to ${active.sessionName}`,
        },
      ],
    };
  }

  return {
    content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

await server.connect(new StdioServerTransport());
