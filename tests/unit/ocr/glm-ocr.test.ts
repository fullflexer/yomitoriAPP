import { afterEach, describe, expect, it, vi } from "vitest";

import { buildKosekiExtractionPrompt } from "../../../src/lib/ocr/prompts/koseki-extract";
import { GlmOcrProvider } from "../../../src/lib/ocr/providers/glm-ocr";
import type { OcrInput } from "../../../src/lib/ocr/types";

const TEST_INPUT: OcrInput = {
  imageBuffer: Buffer.from("test-image"),
  mimeType: "image/png",
  documentType: "computerized_koseki",
};

describe("GlmOcrProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds the expected Ollama chat request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              rawText: "戸主 山田太郎",
              fields: {
                headOfHousehold: {
                  value: "山田太郎",
                  confidence: 0.98,
                },
                registeredAddress: {
                  value: "東京都千代田区一番町1-1",
                  confidence: 0.95,
                },
                persons: [],
              },
              warnings: [],
            }),
          },
          prompt_eval_count: 12,
          eval_count: 34,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GlmOcrProvider({
      baseUrl: "http://localhost:11434/",
      model: "glm-ocr-test",
    });

    await provider.extract(TEST_INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "glm-ocr-test",
        messages: [
          {
            role: "user",
            content: [
              buildKosekiExtractionPrompt(),
              `Document type hint: ${TEST_INPUT.documentType}`,
            ].join("\n\n"),
            images: [TEST_INPUT.imageBuffer.toString("base64")],
          },
        ],
        stream: false,
      }),
    });
  });

  it("parses the Ollama response into an OcrResult", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                rawText: "戸主 山田太郎",
                fields: {
                  headOfHousehold: {
                    value: "山田太郎",
                    confidence: 0.98,
                    rawText: "戸主 山田太郎",
                  },
                  registeredAddress: {
                    value: "東京都千代田区一番町1-1",
                    confidence: 0.95,
                  },
                  persons: [
                    {
                      name: {
                        value: "山田花子",
                        confidence: 0.93,
                      },
                      relationship: {
                        value: "妻",
                        confidence: 0.88,
                      },
                      birthDate: {
                        value: "昭和40年1月1日",
                        confidence: 0.9,
                      },
                      events: [
                        {
                          type: "marriage",
                          date: {
                            value: "平成元年1月1日",
                            confidence: 0.82,
                          },
                          detail: {
                            value: "山田太郎と婚姻",
                            confidence: 0.8,
                          },
                          counterpartName: "山田太郎",
                        },
                      ],
                    },
                  ],
                },
                warnings: [
                  {
                    code: "low_confidence",
                    message: "birth date is blurry",
                    field: "fields.persons[0].birthDate",
                  },
                ],
              }),
            },
            prompt_eval_count: 21,
            eval_count: 55,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );
    const provider = new GlmOcrProvider();

    const result = await provider.extract(TEST_INPUT);

    expect(result).toEqual({
      documentType: "computerized_koseki",
      rawText: "戸主 山田太郎",
      fields: {
        headOfHousehold: {
          value: "山田太郎",
          confidence: 0.98,
          rawText: "戸主 山田太郎",
        },
        registeredAddress: {
          value: "東京都千代田区一番町1-1",
          confidence: 0.95,
          rawText: undefined,
        },
        persons: [
          {
            name: {
              value: "山田花子",
              confidence: 0.93,
              rawText: undefined,
            },
            relationship: {
              value: "妻",
              confidence: 0.88,
              rawText: undefined,
            },
            birthDate: {
              value: "昭和40年1月1日",
              confidence: 0.9,
              rawText: undefined,
            },
            events: [
              {
                type: "marriage",
                date: {
                  value: "平成元年1月1日",
                  confidence: 0.82,
                  rawText: undefined,
                },
                detail: {
                  value: "山田太郎と婚姻",
                  confidence: 0.8,
                  rawText: undefined,
                },
                eventTypeHint: undefined,
                counterpartName: "山田太郎",
              },
            ],
            deathDate: undefined,
            gender: undefined,
            address: undefined,
          },
        ],
      },
      confidence: 0.7,
      warnings: [
        {
          code: "low_confidence",
          message: "birth date is blurry",
          field: "fields.persons[0].birthDate",
        },
      ],
      tokensUsed: 76,
      processingTimeMs: expect.any(Number),
    });
  });

  it("wraps Ollama connection failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434")),
    );
    const provider = new GlmOcrProvider();

    await expect(provider.extract(TEST_INPUT)).rejects.toThrow(
      "Failed to connect to Ollama at http://localhost:11434",
    );
  });
});
