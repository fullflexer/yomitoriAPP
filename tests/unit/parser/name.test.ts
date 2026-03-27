import { describe, expect, it } from "vitest";

import type { KosekiField } from "../../../src/lib/ocr/types";
import {
  extractName,
  normalizeNameText,
} from "../../../src/lib/parser/field-extractors/name";

function buildField(value: string): KosekiField {
  return {
    value,
    confidence: 0.95,
  };
}

describe("extractName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(extractName(buildField("　 山田　太郎  "))).toEqual({
      fullName: "山田 太郎",
    });
  });

  it("extracts kana written in parentheses", () => {
    expect(extractName(buildField("山田 太郎（ヤマダ タロウ）"))).toEqual({
      fullName: "山田 太郎",
      fullNameKana: "ヤマダ タロウ",
    });
  });

  it("normalizes half-width kana to full-width", () => {
    expect(normalizeNameText("ﾔﾏﾀﾞ ﾀﾛｳ")).toBe("ヤマダ タロウ");
  });
});
