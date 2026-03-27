import { describe, expect, it } from "vitest";

import type { OcrResult } from "../../../src/lib/ocr/types";
import { parseKosekiOcrResult } from "../../../src/lib/parser/koseki-parser";
import { validateParsedResult } from "../../../src/lib/parser/validators";

describe("parseKosekiOcrResult", () => {
  it("parses persons, document metadata, and events from OCR fields", () => {
    const ocrResult: OcrResult = {
      rawText:
        "戸主 山田 太郎\n本籍 東京都新宿区西新宿１丁目２番地３号\n平成20年4月1日 佐藤 花子と婚姻",
      documentType: "computerized_koseki",
      fields: {
        headOfHousehold: {
          value: " 山田 太郎 ",
          confidence: 0.93,
        },
        registeredAddress: {
          value: "東京都新宿区西新宿１丁目２番地３号",
          confidence: 0.92,
        },
        persons: [
          {
            name: {
              value: " 山田 太郎（ﾔﾏﾀﾞ ﾀﾛｳ） ",
              confidence: 0.97,
              id: "person-1",
            },
            birthDate: {
              value: "昭和30年5月3日",
              confidence: 0.98,
            },
            gender: {
              value: " 男 ",
              confidence: 0.9,
            },
            address: {
              value: "東京都新宿区西新宿１丁目２番地３号",
              confidence: 0.9,
            },
            events: [
              {
                type: "marriage",
                date: {
                  value: "平成20年4月1日",
                  confidence: 0.87,
                },
                detail: {
                  value: "佐藤 花子と婚姻",
                  confidence: 0.87,
                },
              },
            ],
          },
          {
            name: {
              value: "佐藤 花子",
              confidence: 0.96,
              id: "person-2",
            },
            birthDate: {
              value: "昭和33年8月1日",
              confidence: 0.96,
            },
            events: [],
          },
        ],
      },
      confidence: 0.95,
      warnings: [],
      processingTimeMs: 10,
    };

    const result = parseKosekiOcrResult(ocrResult);

    expect(result.documentType).toBe("computerized_koseki");
    expect(result.headOfHousehold).toBe("山田 太郎");
    expect(result.registeredAddress).toBe("東京都新宿区西新宿1丁目2番3号");
    expect(result.warnings).toEqual([]);
    expect(result.unsupportedReasons).toEqual([]);
    expect(result.persons).toHaveLength(2);
    expect(result.persons[0]).toEqual({
      id: "person-1",
      fullName: "山田 太郎",
      fullNameKana: "ヤマダ タロウ",
      birthDate: "1955-05-03",
      gender: "男",
      address: "東京都新宿区西新宿1丁目2番3号",
      events: [
        {
          type: "marriage",
          date: "2008-04-01",
          dateRaw: "平成20年4月1日",
          detail: "佐藤 花子と婚姻",
          counterpartName: "佐藤 花子",
          confidence: 0.87,
        },
      ],
    });
    expect(result.persons[1]).toMatchObject({
      id: "person-2",
      fullName: "佐藤 花子",
      birthDate: "1958-08-01",
      events: [],
    });
    expect(validateParsedResult(result)).toEqual({ valid: true, errors: [] });
  });

  it("adds warnings for low-confidence fields and fails validation when a name is missing", () => {
    const ocrResult: OcrResult = {
      rawText: "",
      documentType: "computerized_koseki",
      fields: {
        headOfHousehold: {
          value: "山田 太郎",
          confidence: 0.98,
        },
        registeredAddress: {
          value: "東京都新宿区西新宿1丁目2番地3号",
          confidence: 0.98,
        },
        persons: [
          {
            name: {
              value: " ",
              confidence: 0.98,
              id: "person-1",
            },
            birthDate: {
              value: "平成2年1月1日",
              confidence: 0.45,
            },
            events: [],
          },
        ],
      },
      confidence: 0.45,
      warnings: [],
      processingTimeMs: 10,
    };

    const result = parseKosekiOcrResult(ocrResult);

    expect(result.persons).toEqual([
      {
        id: "person-1",
        fullName: "",
        birthDate: "1990-01-01",
        events: [],
      },
    ]);
    expect(result.warnings).toEqual([
      'Low confidence field "fields.persons[0].birthDate" (birthDate) detected: 0.45.',
    ]);
    expect(validateParsedResult(result)).toEqual({
      valid: false,
      errors: ["persons[0].fullName is required."],
    });
  });
});
