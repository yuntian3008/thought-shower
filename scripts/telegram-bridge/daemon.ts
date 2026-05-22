import { TelegramBot } from "./telegram";
import {
  appendInbox,
  ensureDirs,
  getOffset,
  loadConfig,
  loadSessions,
  removePid,
  saveOffset,
  writePid,
} from "./store";

async function main() {
  const config = await loadConfig();
  const bot = new TelegramBot(config.botToken);
  const me = await bot.getMe();

  await ensureDirs();
  await writePid(process.pid);

  console.error(`[telegram-bridge] daemon started (pid ${process.pid})`);
  console.error(`[telegram-bridge] bot: @${me.username}, group: ${config.groupId}`);

  let offset = await getOffset();

  const shutdown = async () => {
    console.error("[telegram-bridge] shutting down");
    await removePid();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (true) {
    try {
      const sessions = await loadSessions();
      const topicToSession = new Map<number, string>();
      for (const [name, info] of Object.entries(sessions)) {
        topicToSession.set(info.topicId, name);
      }

      const updates = await bot.getUpdates(offset, 30);

      for (const u of updates) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg) continue;
        if (msg.chat.id !== config.groupId) continue;
        if (!msg.message_thread_id) continue;
        if (msg.from?.id === config.botId) continue;
        if (msg.from?.id !== config.allowedUserId) continue;

        const sessionName = topicToSession.get(msg.message_thread_id);
        if (!sessionName) continue;

        const line = JSON.stringify({
          from: msg.from?.first_name ?? "Unknown",
          text: msg.text ?? "[non-text]",
          ts: msg.date,
          messageId: msg.message_id,
        });

        await appendInbox(sessionName, line);
        console.error(
          `[telegram-bridge] [${sessionName}] ${msg.from?.first_name}: ${msg.text}`,
        );
      }

      if (offset !== undefined) await saveOffset(offset);
    } catch (err) {
      console.error(`[telegram-bridge] poll error: ${err}`);
      await Bun.sleep(5000);
    }
  }
}

main();
