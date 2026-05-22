const BASE = "https://api.telegram.org/bot";

export interface TgMessage {
  message_id: number;
  message_thread_id?: number;
  from?: { id: number; first_name: string; username?: string; is_bot?: boolean };
  chat: { id: number; title?: string; type: string };
  date: number;
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: { id: number; first_name: string; username?: string };
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export class TelegramBot {
  private url: string;

  constructor(token: string) {
    this.url = `${BASE}${token}`;
  }

  async getMe() {
    return this.call<{ id: number; username: string }>("getMe");
  }

  async getUpdates(offset?: number, timeout = 0) {
    return this.call<TgUpdate[]>("getUpdates", {
      offset,
      timeout,
      allowed_updates: ["message", "callback_query"],
    });
  }

  async sendMessage(chatId: number, text: string, topicId?: number) {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      message_thread_id: topicId,
      parse_mode: "MarkdownV2",
    });
  }

  async sendQuestion(
    chatId: number,
    text: string,
    buttons: { text: string; callback_data: string }[][],
    topicId?: number,
  ) {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      message_thread_id: topicId,
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  async editMessageText(chatId: number, messageId: number, text: string) {
    await this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "MarkdownV2",
    });
  }

  async react(chatId: number, messageId: number, emoji: string) {
    await this.call("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
    });
  }

  async createForumTopic(chatId: number, name: string) {
    return this.call<{ message_thread_id: number; name: string }>(
      "createForumTopic",
      { chat_id: chatId, name },
    );
  }

  private async call<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${this.url}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
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
}
