import type { OcrInput, OcrProvider, OcrResult } from "@/lib/ocr/types";

export type MockOcrProviderOptions = {
  fixedResult?: OcrResult;
  delay?: number;
  shouldFail?: boolean;
};

const DEFAULT_RESULT: OcrResult = {
  rawText:
    "戸籍 山田太郎\n本籍地 東京都千代田区一番町1-1\n山田花子 妻\n山田一郎 長男",
  fields: {
    headOfHousehold: {
      value: "山田 太郎",
      confidence: 0.97,
      rawText: "戸籍 山田太郎",
    },
    registeredAddress: {
      value: "東京都千代田区一番町1-1",
      confidence: 0.94,
      rawText: "本籍地 東京都千代田区一番町1-1",
    },
    persons: [
      {
        name: {
          value: "山田 太郎",
          confidence: 0.96,
          rawText: "山田 太郎",
        },
        birthDate: {
          value: "昭和30年5月3日",
          confidence: 0.93,
          rawText: "昭和30年5月3日",
        },
        gender: {
          value: "男",
          confidence: 0.91,
          rawText: "男",
        },
        deathDate: {
          value: "令和5年2月1日",
          confidence: 0.9,
          rawText: "令和5年2月1日",
        },
        events: [
          {
            type: "birth",
            date: {
              value: "昭和30年5月3日",
              confidence: 0.9,
              rawText: "昭和30年5月3日",
            },
            detail: {
              value: "出生",
              confidence: 0.95,
              rawText: "出生",
            },
          },
          {
            type: "death",
            date: {
              value: "令和5年2月1日",
              confidence: 0.9,
              rawText: "令和5年2月1日",
            },
            detail: {
              value: "死亡",
              confidence: 0.94,
              rawText: "死亡",
            },
          },
        ],
      },
      {
        name: {
          value: "山田 花子",
          confidence: 0.95,
          rawText: "山田 花子",
        },
        relationship: {
          value: "妻",
          confidence: 0.92,
          rawText: "妻",
        },
        birthDate: {
          value: "昭和33年8月1日",
          confidence: 0.91,
          rawText: "昭和33年8月1日",
        },
        gender: {
          value: "女",
          confidence: 0.9,
          rawText: "女",
        },
        events: [
          {
            type: "marriage",
            date: {
              value: "昭和54年4月1日",
              confidence: 0.88,
              rawText: "昭和54年4月1日",
            },
            detail: {
              value: "山田 太郎と婚姻",
              confidence: 0.91,
              rawText: "山田 太郎と婚姻",
            },
            counterpartName: "山田 太郎",
          },
        ],
      },
      {
        name: {
          value: "山田 一郎",
          confidence: 0.95,
          rawText: "山田 一郎",
        },
        relationship: {
          value: "長男",
          confidence: 0.92,
          rawText: "長男",
        },
        birthDate: {
          value: "平成3年4月5日",
          confidence: 0.92,
          rawText: "平成3年4月5日",
        },
        gender: {
          value: "男",
          confidence: 0.89,
          rawText: "男",
        },
        events: [
          {
            type: "birth",
            date: {
              value: "平成3年4月5日",
              confidence: 0.9,
              rawText: "平成3年4月5日",
            },
            detail: {
              value: "出生",
              confidence: 0.95,
              rawText: "出生",
            },
          },
        ],
      },
    ],
  },
  confidence: 0.94,
  warnings: [],
  tokensUsed: 0,
  processingTimeMs: 0,
};

export class MockOcrProvider implements OcrProvider {
  constructor(private readonly options: MockOcrProviderOptions = {}) {}

  async extract(_input: OcrInput): Promise<OcrResult> {
    if (this.options.delay && this.options.delay > 0) {
      await sleep(this.options.delay);
    }

    if (this.options.shouldFail) {
      throw new Error("Mock OCR provider failure");
    }

    return structuredClone(this.options.fixedResult ?? DEFAULT_RESULT);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
