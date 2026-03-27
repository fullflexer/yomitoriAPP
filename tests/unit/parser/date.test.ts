import { describe, expect, it } from "vitest";

import { convertWareki } from "../../../src/lib/parser/field-extractors/date";

describe("convertWareki", () => {
  it.each([
    ["明治45年7月29日", "1912-07-29"],
    ["大正2年5月3日", "1913-05-03"],
    ["昭和30年5月3日", "1955-05-03"],
    ["平成元年1月8日", "1989-01-08"],
    ["令和6年4月1日", "2024-04-01"],
  ])("converts %s to %s", (raw, expected) => {
    expect(convertWareki(raw)).toBe(expected);
  });

  it("returns null for dates before the era start", () => {
    expect(convertWareki("平成元年1月7日")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(convertWareki("昭和30/5/3")).toBeNull();
  });
});
