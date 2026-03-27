import { afterEach, describe, expect, it, vi } from "vitest";

import { OcrAdapter } from "../../../src/lib/ocr/adapter";
import { MockOcrProvider } from "../../../src/lib/ocr/providers/mock";
import type { OcrInput, OcrResult } from "../../../src/lib/ocr/types";

const TEST_INPUT: OcrInput = {
  imageBuffer: Buffer.from("test-image"),
  mimeType: "image/png",
  documentType: "computerized_koseki",
};

const FIXTURE_RESULT: OcrResult = {
  rawText: "戸主 山田太郎",
  fields: {
    headOfHousehold: {
      value: "山田太郎",
      confidence: 0.98,
      rawText: "戸主 山田太郎",
    },
    registeredAddress: {
      value: "東京都港区芝公園1-1-1",
      confidence: 0.95,
      rawText: "本籍 東京都港区芝公園1-1-1",
    },
    persons: [
      {
        name: {
          value: "山田花子",
          confidence: 0.93,
        },
        birthDate: {
          value: "平成2年1月1日",
          confidence: 0.88,
        },
        events: [
          {
            type: "birth",
            date: {
              value: "平成2年1月1日",
              confidence: 0.88,
            },
            detail: {
              value: "出生",
              confidence: 0.94,
            },
          },
        ],
      },
    ],
  },
  confidence: 0.94,
  warnings: [],
  tokensUsed: 123,
  processingTimeMs: 42,
};

describe("OcrAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("MockProviderでextract成功", async () => {
    const provider = new MockOcrProvider({ fixedResult: FIXTURE_RESULT });
    const adapter = new OcrAdapter(provider);

    await expect(adapter.extract(TEST_INPUT)).resolves.toEqual(FIXTURE_RESULT);
  });

  it("extractWithRetryがリトライ後に成功", async () => {
    vi.useFakeTimers();

    const provider = new MockOcrProvider({ fixedResult: FIXTURE_RESULT });
    const extractSpy = vi
      .spyOn(provider, "extract")
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(FIXTURE_RESULT);
    const adapter = new OcrAdapter(provider);
    const resultPromise = adapter.extractWithRetry(TEST_INPUT, 2);

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual(FIXTURE_RESULT);
    expect(extractSpy).toHaveBeenCalledTimes(2);
  });

  it("extractWithValidationが不正結果を拒否", async () => {
    const invalidResult = {
      ...FIXTURE_RESULT,
      fields: {
        ...FIXTURE_RESULT.fields,
        headOfHousehold: {
          value: "山田太郎",
          confidence: 1.5,
        },
      },
    } as OcrResult;
    const provider = new MockOcrProvider({ fixedResult: invalidResult });
    const adapter = new OcrAdapter(provider);

    await expect(adapter.extractWithValidation(TEST_INPUT)).rejects.toThrow(
      "fields.headOfHousehold.confidence",
    );
  });
});
