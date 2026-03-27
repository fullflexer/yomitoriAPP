import { describe, expect, it } from "vitest";

import type { OcrResult } from "../../../src/lib/ocr/types";
import { detectUnsupported } from "../../../src/lib/parser/unsupported-detector";

describe("detectUnsupported", () => {
  it("detects handwriting-like documents from many very low-confidence fields", () => {
    const ocrResult: OcrResult = {
      documentType: "computerized_koseki",
      rawText: "戸籍謄本",
      fields: {
        headOfHousehold: {
          value: "山田 太郎",
          confidence: 0.2,
        },
        registeredAddress: {
          value: "東京都千代田区",
          confidence: 0.1,
        },
        persons: [
          {
            name: {
              value: "山田 太郎",
              confidence: 0.25,
            },
            birthDate: {
              value: "昭和30年5月3日",
              confidence: 0.9,
            },
            events: [],
          },
        ],
      },
      confidence: 0.2,
      warnings: [],
      processingTimeMs: 10,
    };

    expect(detectUnsupported(ocrResult)).toContain(
      "Handwritten or heavily degraded text was detected from many very low-confidence OCR fields.",
    );
  });

  it("detects reformatted original koseki documents from documentType", () => {
    const ocrResult: OcrResult = {
      documentType: "original_koseki",
      rawText: "",
      fields: {
        headOfHousehold: {
          value: "山田 太郎",
          confidence: 0.95,
        },
        registeredAddress: {
          value: "東京都港区",
          confidence: 0.95,
        },
        persons: [],
      },
      confidence: 0.95,
      warnings: [],
      processingTimeMs: 10,
    };

    expect(detectUnsupported(ocrResult)).toContain(
      "Reformatted or original koseki documents are unsupported.",
    );
  });

  it("detects adoption-related entries", () => {
    const ocrResult: OcrResult = {
      documentType: "computerized_koseki",
      rawText: "",
      fields: {
        headOfHousehold: {
          value: "山田 太郎",
          confidence: 0.95,
        },
        registeredAddress: {
          value: "東京都港区",
          confidence: 0.95,
        },
        persons: [
          {
            name: {
              value: "山田 太郎",
              confidence: 0.95,
            },
            birthDate: {
              value: "昭和30年5月3日",
              confidence: 0.95,
            },
            events: [
              {
                type: "adoption",
                date: {
                  value: "平成10年4月1日",
                  confidence: 0.9,
                },
                detail: {
                  value: "養子縁組",
                  confidence: 0.9,
                },
              },
            ],
          },
        ],
      },
      confidence: 0.95,
      warnings: [],
      processingTimeMs: 10,
    };

    expect(detectUnsupported(ocrResult)).toContain(
      "Adoption-related entries are unsupported in the MVP parser.",
    );
  });

  it("detects foreign nationality-related entries", () => {
    const ocrResult: OcrResult = {
      documentType: "computerized_koseki",
      rawText: "米国籍取得",
      fields: {
        headOfHousehold: {
          value: "山田 太郎",
          confidence: 0.95,
        },
        registeredAddress: {
          value: "東京都港区",
          confidence: 0.95,
        },
        persons: [
          {
            name: {
              value: "山田 太郎",
              confidence: 0.95,
            },
            birthDate: {
              value: "昭和30年5月3日",
              confidence: 0.95,
            },
            events: [
              {
                type: "other",
                date: {
                  value: "平成10年4月1日",
                  confidence: 0.9,
                },
                detail: {
                  value: "米国籍取得",
                  confidence: 0.9,
                },
              },
            ],
          },
        ],
      },
      confidence: 0.95,
      warnings: [],
      processingTimeMs: 10,
    };

    expect(detectUnsupported(ocrResult)).toContain(
      "Foreign nationality-related entries are unsupported.",
    );
  });
});
