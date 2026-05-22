# Code Style

## Formatting (Prettier)

- Double quotes, semicolons, 2-space indent, 80 char width, es5 trailing commas
- Prettier handles this automatically — don't fight it

## Import Order

Group imports in this order, separated by blank lines:

1. Third-party packages (npm/jsr)
2. Relative imports (`./...`, `../...`)

**Pinning side-effect imports to the top.** If the project uses `@trivago/prettier-plugin-sort-imports`, it ignores `// prettier-ignore` and will move side-effect imports (e.g. `import "./instrument";`) to their alphabetical slot. To pin one, add a regex as the first entry of `importOrder` in `.prettierrc.json` — the plugin sorts by first-match within `importOrder`.

## File Naming

- kebab-case for source files: `telegram-daemon.ts`, `mcp-server.ts`
- Use suffix when the role is meaningful in this codebase (`.test.ts`, `.spec.ts`). Otherwise no forced suffix.

## Exports

- Prefer named exports over default exports
