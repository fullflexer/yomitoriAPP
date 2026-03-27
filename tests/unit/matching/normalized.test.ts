import { describe, expect, it } from "vitest";

import {
  normalizeJapaneseName,
  normalizedMatch,
} from "../../../src/lib/matching/strategies/normalized";

describe("normalizedMatch", () => {
  it("normalizes legacy kanji before matching", () => {
    expect(normalizeJapaneseName("齋藤")).toBe("斎藤");
    expect(normalizedMatch("齋藤 太郎", "斎藤 太郎")).toBe(0.9);
  });

  it("normalizes hiranaga and katakana variants", () => {
    expect(normalizedMatch("さいとう たろう", "サイトウ タロウ")).toBe(0.9);
  });

  it("normalizes half-width kana before matching", () => {
    expect(normalizedMatch("ﾀｶﾊｼ ﾊﾅｺ", "たかはし はなこ")).toBe(0.9);
  });

  it("returns partial confidence for substring matches", () => {
    expect(normalizedMatch("山田 太郎", "山田")).toBe(0.65);
  });

  it("returns 0 when names are materially different", () => {
    expect(normalizedMatch("山田 太郎", "佐藤 花子")).toBe(0);
  });
});
