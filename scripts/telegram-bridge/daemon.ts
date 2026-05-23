import { TelegramBot } from "./telegram";
import type { TgMessage, PhotoSize } from "./telegram";
import { escapeMarkdownV2 } from "./markdown";
import {
  appendInbox,
  ensureDirs,
  getOffset,
  isProcessAlive,
  listPending,
  loadConfig,
  loadSessions,
  readPending,
  removePending,
  removePid,
  saveOffset,
  writePid,
  writeResponse,
} from "./store";

export const MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

const GC_INTERVAL_MS = 5 * 60 * 1000;
const FREE_TEXT_PREVIEW_MAX = 80;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

async function gcOrphanPendings(bot: TelegramBot) {
  const pendings = await listPending();
  for (const { id, data } of pendings) {
    if (isProcessAlive(data.mcpPid)) continue;
    await removePending(id);
    bot
      .editMessageText(data.chatId, data.messageId, escapeMarkdownV2("❌ Session ended"))
      .catch(() => {});
    console.error(
      `[telegram-bridge] gc removed orphan pending: ${id} (pid ${data.mcpPid} dead)`,
    );
  }
}

async function main() {
  const config = await loadConfig();
  const bot = new TelegramBot(config.botToken);
  const me = await bot.getMe();

  await ensureDirs();
  await writePid(process.pid);

  console.error(`[telegram-bridge] daemon started (pid ${process.pid})`);
  console.error(`[telegram-bridge] bot: @${me.username}, group: ${config.groupId}`);

  let offset = await getOffset();

  const gcTimer = setInterval(() => {
    gcOrphanPendings(bot).catch((e) =>
      console.error(`[telegram-bridge] gc error: ${e}`),
    );
  }, GC_INTERVAL_MS);

  const shutdown = async () => {
    console.error("[telegram-bridge] shutting down");
    clearInterval(gcTimer);
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
                  `✅ ${escapeMarkdownV2(label)}`,
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

        const msgTimestampMs = msg.date * 1000;
        const pendings = await listPending();
        const matched = pendings
          .filter(
            (p) =>
              p.data.topicId === msg.message_thread_id &&
              p.data.createdAt < msgTimestampMs,
          )
          .sort((a, b) => a.data.createdAt - b.data.createdAt)[0];

        if (matched && msg.text) {
          const preview = truncate(msg.text, FREE_TEXT_PREVIEW_MAX);
          await writeResponse(matched.id, {
            label: msg.text,
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
          text: msg.text ?? "[non-text]",
          ts: msg.date,
          messageId: msg.message_id,
        });

        await appendInbox(sessionName, line);
        bot.react(config.groupId, msg.message_id, "👌").catch(() => {});
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
