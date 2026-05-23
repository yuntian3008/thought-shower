# Telegram bridge — multimedia support (photo + document, both directions)

**Status:** Approved design — pending implementation plan
**Branch:** `feat/telegram-multimedia`
**Date:** 2026-05-23

## Goal

Extend the Telegram bridge so Claude can both **send** and **receive** photos and documents through the bridge, without losing any of the existing text-only behavior.

## Scope

**In:**
- Inbound: photo, document. Daemon downloads to local disk; agent reads via existing tools.
- Outbound: `send_photo`, `send_document` MCP tools. Local-path input only.
- Caption text supported in both directions.
- GC of downloaded files (TTL 7 days).
- Free-text-answer flow: a photo+caption reply resolves a pending `ask_telegram` via its caption.

**Out (v1):**
- voice, video, video_note, audio, animation/GIF, sticker (received → existing `[non-text]` placeholder).
- URL or `file_id` input for outbound.
- Multipart streaming for >50 MB files (Telegram Bot API hard limit unless self-hosted server).
- Transcription / OCR.
- Media galleries (sendMediaGroup).

## Design decisions (locked, from brainstorm)

| Topic | Decision |
| --- | --- |
| Direction | Both (User→Claude + Claude→User) |
| Media types | Photo + Document |
| Inbound delivery | Daemon downloads → local path, agent uses `Read` |
| Cleanup | TTL 7 days, GC in same 5-min interval as orphan-pending GC |
| Outbound tool shape | Separate tools: `send_photo`, `send_document` |
| Outbound input | Local path only |
| Caption as answer | `effectiveText = msg.text ?? msg.caption` for free-text answer matching |
| Oversize | Pre-check via `fs.stat`, return MCP error before upload |

## Architecture (in-place extension, no new files)

```
telegram.ts (TelegramBot)
  + sendPhoto(chatId, localPath, caption?, topicId?)
  + sendDocument(chatId, localPath, caption?, topicId?, filename?)
  + getFile(fileId)                         // wraps Telegram getFile
  + downloadFile(filePath, destPath)        // GET https://api.telegram.org/file/bot<T>/<file_path>

mcp-server.ts
  + tool send_photo     { path, caption?, session }
  + tool send_document  { path, caption?, filename?, session }
  ; send_telegram, ask_telegram, telegram_seen, telegram_init, telegram_daemon unchanged

daemon.ts
  + photo/document handler: pick largest photo → getFile → downloadFile → enrich inbox JSON
  + effectiveText = msg.text ?? msg.caption (free-text answer flow uses this)
  + GC for inbox-media reuses the existing 5-min timer

store.ts
  + export INBOX_MEDIA_DIR
  + mediaPath(session, msgId, ext, filename?)
  + ensureMediaDir(session)
  + gcInboxMedia(ttlMs)
```

State layout under `~/.claude/thought-shower/telegram-bridge/`:

```
inbox/<session>.jsonl       # existing — schema extended additively
inbox-media/<session>/
  37.jpg                    # photo  — <messageId>.<ext>
  42-report.pdf             # document — <messageId>-<original-filename>
```

## Inbox JSON schema

`media` is **optional** and additive — existing consumers (Monitor, agent) keep working.

```json
{
  "from": "Yuntian",
  "text": "<msg.text or msg.caption or empty string>",
  "ts": 1779471718,
  "messageId": 37,
  "media": {
    "type": "photo" | "document",
    "path": "/abs/path/.../inbox-media/<session>/37.jpg",
    "mime": "image/jpeg",
    "size": 234567,
    "filename": "report.pdf" | null
  }
}
```

For documents, `filename` = the original filename from Telegram. For photos, `filename` = `null` (Telegram does not carry an original name).

## MCP tool contracts

### `send_photo`

```
input:  { path: string, caption?: string, session: string }
output: ok("Photo sent (<size> bytes)") | err(<reason>)
pre-check:
  - resolve path → stat
  - reject if missing, not a regular file, not readable
  - reject if size > 10 MB (Telegram sendPhoto limit via Bot API)
side effect: multipart upload to Telegram sendPhoto on the session topic
```

### `send_document`

```
input:  { path: string, caption?: string, filename?: string, session: string }
output: ok("Document sent (<size> bytes, name=<name>)") | err(<reason>)
pre-check:
  - resolve path → stat
  - reject if missing, not a regular file, not readable
  - reject if size > 50 MB (Telegram Bot API hard limit)
side effect: multipart upload to Telegram sendDocument on the session topic
filename defaults to basename(path)
```

## Daemon inbound flow

For each Telegram update where `msg.chat.id === config.groupId` and the topic belongs to a known session:

```
1. Identify media (mutually exclusive in scope):
   - msg.photo   → pick the largest PhotoSize (last array entry)
   - msg.document → use as-is
   - else        → skip media branch, behave as today
2. file_id → bot.getFile(file_id) → file_path
3. destPath = mediaPath(session, messageId, ext, filename)
   - photo: ext from mime ("image/jpeg" → ".jpg", "image/png" → ".png", fallback ".jpg" since Telegram photos are JPEG by spec)
   - document: <messageId>-<sanitized original filename>, where sanitize strips path separators (`/`, `\`), null bytes, and leading dots; falls back to `file` if the result is empty
4. downloadFile(file_path, destPath)
5. effectiveText = msg.text ?? msg.caption ?? ""
6. Match pending question by topic + createdAt < msgTs:
   - matched + effectiveText non-empty → resolve as free-text answer, edit pending message,
     react 👌 on user's msg. Don't write to inbox (existing pattern).
   - else → append inbox JSONL with `media` field, react 👌.
7. Monitor (`tail -f`) wakes agent. Agent reads `media.path` using the Read tool.
```

If `getFile` or `downloadFile` throws, log the error and fall back to the existing `[non-text]` inbox line (no `media` field). Bridge stays text-functional even when media download fails.

## GC

`gcInboxMedia(ttlMs)`:

- walks `INBOX_MEDIA_DIR/*/*`
- `unlink` files where `Date.now() - stat.mtimeMs > ttlMs`
- swallow errors per-file (best-effort)
- empty session dirs left in place

Invoked from the existing 5-min `setInterval` in `daemon.ts` alongside `gcOrphanPendings`.

## Edge cases

| Case | Behavior |
| --- | --- |
| Outbound oversize | Pre-check throws MCP error; no upload attempt |
| Outbound path missing | Pre-check throws MCP error |
| Inbound download fails | Log; write `[non-text]` inbox line (no `media`) |
| Photo with no caption | `text = ""`, `media` present |
| Sticker / voice / video / animation | Existing `[non-text]` placeholder |
| Photo+caption as `ask_telegram` answer | Caption resolves the question; file is still downloaded for later use |
| Two photos same `messageId` | Cannot happen — messageId is unique per chat |

## Tests (`*.spec.ts`, `bun test`)

```
store.spec.ts
  - mediaPath() naming: photos use <msgId>.<ext>, documents use <msgId>-<sanitized filename>
  - gcInboxMedia(): file older than TTL unlinked; younger file kept

telegram.spec.ts
  - sendPhoto / sendDocument call shape: multipart fetch with chat_id, message_thread_id, caption
  - downloadFile: GET to correct URL, writes bytes to dest

daemon.spec.ts (lightweight integration)
  - stubbed Telegram getUpdates → photo update → inbox JSON shape + file written
  - download failure → fallback "[non-text]" inbox line

mcp-server.spec.ts
  - send_photo pre-check: rejects oversize, rejects missing path
  - send_document pre-check: same
```

Mocking uses the `*.deps.ts` re-export pattern (per `.agents/rules/testing.md`) to avoid Bun's process-wide `mock.module` leakage.

## Doc updates (same PR)

- `README.md` — Telegram bridge section: list `send_photo`, `send_document`; mention `inbox-media/` directory.
- `AGENTS.md` — `Telegram bridge (MCP server)` block: add new tool names.
- `skills/telegram-on/SKILL.md` — under "Handle incoming messages": if inbox JSON has `media`, call `Read` on `media.path`.

## Implementation notes (token efficiency)

The plugin's MCP tool descriptions and skill text ride in the system prompt every conversation. To keep the per-turn token cost low:

- `send_photo` / `send_document` `description` must be terse — one line each, no examples, no marketing. Compare against the existing terse tools (`telegram_seen`, `telegram_init`) rather than the long `send_telegram` description.
- `inputSchema` field descriptions: omit unless the field name is ambiguous. `path`, `caption`, `session` are self-explanatory after the tool-level description names them.
- Inbox JSON: only emit `media` when present. Do NOT emit `"media": null` on text-only messages (would add bytes for every Monitor wake).
- Skill update in `telegram-on`: one sentence under step 7, not a new section.
- Reuse the existing 5-min `setInterval` — do NOT create a new timer.
- No new MCP tool for `download_telegram_file` or similar — daemon download path is the only path.
- Add the new TelegramBot methods to the existing class file. No `telegram-media.ts`.

## Risk / open items

- 10 MB photo limit is Bot API spec; verify the actual error Telegram returns for 11 MB photo and ensure pre-check matches.
- `msg.photo[]` typing not yet in `TgMessage` interface — needs a small extension (`photo?: PhotoSize[]`, `document?: { file_id, file_name, mime_type, file_size }`, `caption?: string`).
