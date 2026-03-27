import { describe, expect, it } from "vitest";

import { exactMatch } from "../../../src/lib/matching/strategies/exact";

describe("exactMatch", () => {
  it("returns 1 for identical names", () => {
    expect(exactMatch("山田 太郎", "山田 太郎")).toBe(1);
  });

  it("returns 0 when whitespace differs", () => {
    expect(exactMatch("山田 太郎", "山田太郎")).toBe(0);
  });

  it("returns 0 for different names", () => {
    expect(exactMatch("山田 太郎", "山田 花子")).toBe(0);
  });
});
