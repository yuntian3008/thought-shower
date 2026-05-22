import { TelegramBot } from "./telegram";
import {
  appendInbox,
  ensureDirs,
  getOffset,
  loadConfig,
  loadSessions,
  readPending,
  removePending,
  removePid,
  saveOffset,
  writePid,
  writeResponse,
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

        if (u.callback_query) {
          const cb = u.callback_query;
          const data = cb.data ?? "";
          const match = data.match(/^ask:([^:]+):(\d+)$/);
          if (match) {
            const [, questionId, indexStr] = match;
            const pending = await readPending(questionId);
            if (pending) {
              const index = Number(indexStr);
              const label = pending.options[index]?.label ?? `Option ${index}`;

              await writeResponse(questionId, {
                label,
                index,
                timestamp: Date.now(),
              });
              await removePending(questionId);

              bot.answerCallbackQuery(cb.id, label).catch(() => {});
              bot
                .editMessageText(
                  pending.chatId,
                  pending.messageId,
                  `✅ ${label}`,
                )
                .catch(() => {});

              console.error(`[telegram-bridge] answer: ${questionId} → ${label}`);
            } else {
              bot.answerCallbackQuery(cb.id, "Expired").catch(() => {});
            }
          }
          continue;
        }

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
        bot.react(config.groupId, msg.message_id, "👀").catch(() => {});
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
