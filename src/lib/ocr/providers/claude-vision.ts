import Anthropic from "@anthropic-ai/sdk";

import { buildKosekiExtractionPrompt } from "@/lib/ocr/prompts/koseki-extract";
import { parseOcrPayload } from "@/lib/ocr/providers/shared";
import type { OcrInput, OcrProvider, OcrResult } from "@/lib/ocr/types";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;

type SupportedImageMimeType =
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

type ClaudeVisionProviderOptions = {
  apiKey?: string;
  client?: Anthropic;
  model?: string;
  maxTokens?: number;
};

export class ClaudeVisionProvider implements OcrProvider {
  private client?: Anthropic;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: ClaudeVisionProviderOptions = {}) {
    this.client = options.client;
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async extract(input: OcrInput): Promise<OcrResult> {
    const startedAt = Date.now();
    const mediaType = getSupportedImageMimeType(input.mimeType);
    const prompt = [
      buildKosekiExtractionPrompt(),
      `Document type hint: ${input.documentType}`,
    ].join("\n\n");
    const response = await this.getClient().messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: input.imageBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });
    const responseText = response.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!responseText) {
      throw new Error("Claude Vision returned no text content");
    }

    const payload = parseOcrPayload(responseText, {
      providerName: "Claude Vision",
    });

    return {
      documentType: input.documentType,
      rawText: payload.rawText,
      fields: payload.fields,
      confidence: payload.confidence,
      warnings: payload.warnings,
      tokensUsed: getTotalTokensUsed(response.usage),
      processingTimeMs: Date.now() - startedAt,
    };
  }

  private getClient() {
    if (!this.client) {
      if (!this.apiKey) {
        throw new Error("Missing required environment variable: ANTHROPIC_API_KEY");
      }

      this.client = new Anthropic({
        apiKey: this.apiKey,
      });
    }

    return this.client;
  }
}

function getSupportedImageMimeType(mimeType: string): SupportedImageMimeType {
  switch (mimeType) {
    case "image/gif":
    case "image/jpeg":
    case "image/png":
    case "image/webp":
      return mimeType;
    default:
      throw new Error(`Unsupported image mime type for Claude Vision: ${mimeType}`);
  }
}

function getTotalTokensUsed(
  usage:
    | {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      }
    | undefined,
) {
  if (!usage) {
    return undefined;
  }

  return (
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}
