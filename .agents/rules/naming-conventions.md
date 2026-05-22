# Naming Conventions

## Code

| Element                    | Convention       | Example                                |
| -------------------------- | ---------------- | -------------------------------------- |
| Files                      | kebab-case       | `telegram-daemon.ts`, `mcp-server.ts`  |
| Variables, functions       | camelCase        | `sendMessage`, `getActiveSession`      |
| Classes, interfaces, types | PascalCase       | `TelegramSession`, `ToolHandler`       |
| Constants                  | UPPER_SNAKE_CASE | `MAX_MESSAGE_LENGTH`, `DEFAULT_TOPIC`  |
| Env vars                   | UPPER_SNAKE_CASE | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP` |

## File Suffixes

Use suffix only when role is non-obvious from the filename:

| Suffix     | Role             |
| ---------- | ---------------- |
| `.test.ts` | Integration test |
| `.spec.ts` | Unit test        |
