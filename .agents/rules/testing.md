# Testing

## Runner

- Use `bun test` — not Jest, not Mocha (legacy, being migrated away)
- Import from `bun:test`: `test`, `expect`, `describe`, `beforeEach`, `afterEach`

## File Naming

| Suffix      | Type             | Dependencies           |
| ----------- | ---------------- | ---------------------- |
| `*.spec.ts` | Unit test        | Mocked dependencies    |
| `*.test.ts` | Integration test | Real DB, real services |

Tests are colocated next to their source files.

## When to Write Tests

- Unit tests (`*.spec.ts`): write for new business logic by default
- Integration tests (`*.test.ts`): only when explicitly requested — not required by default
- Bug fixes: always include a regression test

## Test Naming

```typescript
describe("updateUserFlags", () => {
  test("should set first run flag when user completes first run", () => {
    // ...
  });

  test("should throw when user not found", () => {
    // ...
  });
});
```

Pattern: `should [behavior] when [condition]`

## Mocking

- Mock only external services and side effects (network, FS writes, subprocesses)
- Don't test implementation details — test inputs and outputs
- **Type Bun mock arg lists explicitly.** `mock(async () => x)` produces `mock.calls[i]: []` (empty tuple), so `mock.calls[0]?.[0]` fails TS2493. If you'll inspect call args, type them: `mock(async (..._args: unknown[]) => x)`.
- **Bun's `mock.module` leaks process-wide; isolate via a `*.deps.ts` bridge re-export.** There is no per-file unmock — `mock.restore()` only resets `mock()` call counts; ESM exports are immutable so namespace monkey-patching throws. If a spec mocks a module that another spec also imports, the stub leaks across files. Workaround: add a thin re-export next to the helper (`<helper>.deps.ts` exporting the symbol from the canonical path), have the helper import from the bridge, and mock the bridge path in the spec.

## Type-only verification

When changing TypeScript-shape only (interfaces, generics, `import type`), the build can pass while types are broken — bundlers strip type-only imports before compiling, so `TS2305 "no exported member 'Foo'"` slips through. Run `bunx tsc --noEmit` to catch shape errors that the build misses.
