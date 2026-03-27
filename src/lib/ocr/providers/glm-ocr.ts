import { buildKosekiExtractionPrompt } from "@/lib/ocr/prompts/koseki-extract";
import { parseOcrPayload } from "@/lib/ocr/providers/shared";
import type { OcrInput, OcrProvider, OcrResult } from "@/lib/ocr/types";

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

    const payload = parseOcrPayload(responseText, {
      providerName: "GLM-OCR",
      defaultConfidence: DEFAULT_CONFIDENCE,
    });

    return {
      documentType: input.documentType,
      rawText: payload.rawText,
      fields: payload.fields,
      confidence: payload.confidence,
      warnings: payload.warnings,
      tokensUsed: getTotalTokensUsed(responseBody),
      processingTimeMs: Date.now() - startedAt,
    };
  }
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
