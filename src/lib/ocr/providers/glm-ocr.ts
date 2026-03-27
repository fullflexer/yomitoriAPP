import { buildKosekiExtractionPrompt } from "@/lib/ocr/prompts/koseki-extract";
import type { KosekiFields, OcrInput, OcrProvider, OcrResult } from "@/lib/ocr/types";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "glm-ocr";
const DEFAULT_CONFIDENCE = 0.7;

type GlmOcrProviderOptions = {
  baseUrl?: string;
  model?: string;
};

type OllamaGenerateResponse = {
  response?: string;
  eval_count?: number;
  prompt_eval_count?: number;
  done?: boolean;
};

export class GlmOcrProvider implements OcrProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options: GlmOcrProviderOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.OLLAMA_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  }

  async extract(input: OcrInput): Promise<OcrResult> {
    const startedAt = Date.now();
    const prompt = [
      buildKosekiExtractionPrompt(),
      `Document type hint: ${input.documentType}`,
    ].join("\n\n");
    const imageBase64 = input.imageBuffer.toString("base64");

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          images: [imageBase64],
          stream: false,
        }),
      });
    } catch (error) {
      throw new Error(
        `Failed to connect to Ollama at ${this.baseUrl}: ${getErrorMessage(error)}`,
      );
    }

    if (!response.ok) {
      const errorBody = await safeReadText(response);
      const suffix = errorBody ? `: ${errorBody}` : "";
      throw new Error(`Ollama chat request failed with status ${response.status}${suffix}`);
    }

    const responseBody = (await response.json()) as OllamaGenerateResponse;
    const responseText = responseBody.response?.trim();

    if (!responseText) {
      throw new Error("GLM-OCR returned no text content");
    }

    // GLM-OCR は汎用 OCR（テキスト抽出のみ）。構造化 JSON は返さない。
    // rawText として返し、構造化はパイプラインの後段で行う。
    const emptyFields = {
      headOfHousehold: { value: "", confidence: DEFAULT_CONFIDENCE },
      registeredAddress: { value: "", confidence: DEFAULT_CONFIDENCE },
      persons: [],
    };

    // responseText から簡易的にフィールドを抽出する試み
    const fields = tryExtractFieldsFromText(responseText, DEFAULT_CONFIDENCE);

    return {
      documentType: input.documentType,
      rawText: responseText,
      fields: fields ?? emptyFields,
      confidence: DEFAULT_CONFIDENCE,
      warnings: [{ code: "raw_ocr", message: "GLM-OCR raw text output — manual review recommended" }],
      tokensUsed: getTotalTokensUsed(responseBody),
      processingTimeMs: Date.now() - startedAt,
    };
  }
}

function tryExtractFieldsFromText(text: string, confidence: number) {
  try {
    // JSON が埋まっている場合はパースを試みる
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (parsed.fields && typeof parsed.fields === "object") {
        return undefined; // parseOcrPayload に任せる
      }
    }
  } catch {
    // JSON ではない → テキストから簡易抽出
  }

  // テキストベースの簡易抽出
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const mkField = (value: string) => ({ value, confidence });

  // 氏名パターン: 「氏名」「名前」「戸主」等の後の文字列
  const nameMatch = text.match(/(?:氏名|名前|戸主|筆頭者)[：:\s]*(.+)/);
  const addressMatch = text.match(/(?:本籍|住所)[：:\s]*(.+)/);

  return {
    headOfHousehold: mkField(nameMatch?.[1]?.trim() ?? lines[0] ?? ""),
    registeredAddress: mkField(addressMatch?.[1]?.trim() ?? ""),
    persons: [],
  };
}

function getTotalTokensUsed(response: OllamaGenerateResponse) {
  return (response.eval_count ?? 0) + (response.prompt_eval_count ?? 0);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function safeReadText(response: Response) {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
