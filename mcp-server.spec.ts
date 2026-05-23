import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "node:os";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { preCheckMedia } from "./mcp-server";

const TMP = join(tmpdir(), "thought-shower-mcp-spec");

describe("preCheckMedia", () => {
  beforeEach(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(TMP, { recursive: true });
  });
  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  test("should reject missing path", async () => {
    const result = await preCheckMedia(join(TMP, "no.bin"), 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
  });

  test("should reject oversize file", async () => {
    const p = join(TMP, "big.bin");
    await writeFile(p, new Uint8Array(2000));
    const result = await preCheckMedia(p, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
  });

  test("should accept a regular file under the limit", async () => {
    const p = join(TMP, "ok.bin");
    await writeFile(p, new Uint8Array(500));
    const result = await preCheckMedia(p, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.size).toBe(500);
  });

  test("should reject when path is a directory", async () => {
    const p = join(TMP, "dir");
    await mkdir(p, { recursive: true });
    const result = await preCheckMedia(p, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a regular file/i);
  });
});
