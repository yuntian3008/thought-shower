import { test, expect, describe } from "bun:test";
import {
  effectiveText,
  pickPhotoExt,
  pickPhoto,
} from "./daemon";
import type { TgMessage, PhotoSize } from "./telegram";

describe("effectiveText", () => {
  test("should prefer msg.text", () => {
    const m = { text: "hi", caption: "cap" } as TgMessage;
    expect(effectiveText(m)).toBe("hi");
  });

  test("should fall back to msg.caption", () => {
    const m = { caption: "cap" } as TgMessage;
    expect(effectiveText(m)).toBe("cap");
  });

  test("should return empty string when neither present", () => {
    const m = {} as TgMessage;
    expect(effectiveText(m)).toBe("");
  });
});

describe("pickPhotoExt", () => {
  test("should map known mime types", () => {
    expect(pickPhotoExt("image/jpeg")).toBe(".jpg");
    expect(pickPhotoExt("image/png")).toBe(".png");
    expect(pickPhotoExt("image/webp")).toBe(".webp");
  });

  test("should fall back to .jpg for unknown or missing mime", () => {
    expect(pickPhotoExt(undefined)).toBe(".jpg");
    expect(pickPhotoExt("application/octet-stream")).toBe(".jpg");
  });
});

describe("pickPhoto", () => {
  test("should pick the largest PhotoSize (last in array per Telegram convention)", () => {
    const photos: PhotoSize[] = [
      { file_id: "a", file_unique_id: "ua", width: 90, height: 90 },
      { file_id: "b", file_unique_id: "ub", width: 320, height: 320 },
      { file_id: "c", file_unique_id: "uc", width: 1280, height: 1280 },
    ];
    expect(pickPhoto(photos)?.file_id).toBe("c");
  });

  test("should return null when array is empty or undefined", () => {
    expect(pickPhoto(undefined)).toBe(null);
    expect(pickPhoto([])).toBe(null);
  });
});
