import Anthropic from "@anthropic-ai/sdk";

import { buildKosekiExtractionPrompt } from "@/lib/ocr/prompts/koseki-extract";
import type {
  KosekiEventField,
  KosekiField,
  KosekiFields,
  KosekiPersonField,
  OcrInput,
  OcrProvider,
  OcrResult,
  OcrWarning,
} from "@/lib/ocr/types";

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

type ClaudeOcrPayload = Omit<OcrResult, "processingTimeMs" | "tokensUsed"> &
  Partial<Pick<OcrResult, "processingTimeMs" | "tokensUsed">>;

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

    const payload = parseClaudePayload(responseText);

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

function parseClaudePayload(responseText: string): ClaudeOcrPayload {
  const jsonCandidate = extractJsonObject(responseText);
  const parsed = JSON.parse(jsonCandidate) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Claude Vision payload must be a JSON object");
  }

  const payload = parsed as Partial<ClaudeOcrPayload>;

  if (typeof payload.rawText !== "string") {
    throw new Error("Claude Vision payload is missing rawText");
  }

  return {
    rawText: payload.rawText,
    fields: parseFields(payload.fields),
    confidence: parseConfidence(payload.confidence, "confidence"),
    warnings: parseWarnings(payload.warnings),
  };
}

function extractJsonObject(responseText: string) {
  const fencedMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? responseText.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Claude Vision response did not contain a JSON object");
  }

  return candidate.slice(start, end + 1);
}

function parseFields(value: unknown): KosekiFields {
  if (!value || typeof value !== "object") {
    throw new Error("Claude Vision payload is missing fields");
  }

  const fields = value as Partial<KosekiFields>;

  return {
    headOfHousehold: parseField(fields.headOfHousehold, "fields.headOfHousehold"),
    registeredAddress: parseField(
      fields.registeredAddress,
      "fields.registeredAddress",
    ),
    persons: parsePersons(fields.persons),
  };
}

function parsePersons(value: unknown): KosekiPersonField[] {
  if (!Array.isArray(value)) {
    throw new Error("Claude Vision payload fields.persons must be an array");
  }

  return value.map((person, personIndex) => {
    if (!person || typeof person !== "object") {
      throw new Error(
        `Claude Vision payload fields.persons[${personIndex}] must be an object`,
      );
    }

    const typedPerson = person as Partial<KosekiPersonField>;

    return {
      name: parseField(typedPerson.name, `fields.persons[${personIndex}].name`),
      relationship:
        typedPerson.relationship === undefined
          ? undefined
          : parseField(
              typedPerson.relationship,
              `fields.persons[${personIndex}].relationship`,
            ),
      birthDate: parseField(
        typedPerson.birthDate,
        `fields.persons[${personIndex}].birthDate`,
      ),
      deathDate:
        typedPerson.deathDate === undefined
          ? undefined
          : parseField(
              typedPerson.deathDate,
              `fields.persons[${personIndex}].deathDate`,
            ),
      gender:
        typedPerson.gender === undefined
          ? undefined
          : parseField(typedPerson.gender, `fields.persons[${personIndex}].gender`),
      address:
        typedPerson.address === undefined
          ? undefined
          : parseField(typedPerson.address, `fields.persons[${personIndex}].address`),
      events: parseEvents(typedPerson.events, personIndex),
    };
  });
}

function parseEvents(value: unknown, personIndex: number): KosekiEventField[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Claude Vision payload fields.persons[${personIndex}].events must be an array`,
    );
  }

  return value.map((event, eventIndex) => {
    if (!event || typeof event !== "object") {
      throw new Error(
        `Claude Vision payload fields.persons[${personIndex}].events[${eventIndex}] must be an object`,
      );
    }

    const typedEvent = event as Partial<KosekiEventField>;

    if (typeof typedEvent.type !== "string") {
      throw new Error(
        `Claude Vision payload fields.persons[${personIndex}].events[${eventIndex}].type must be a string`,
      );
    }

    return {
      type: typedEvent.type,
      date: parseField(
        typedEvent.date,
        `fields.persons[${personIndex}].events[${eventIndex}].date`,
      ),
      detail: parseField(
        typedEvent.detail,
        `fields.persons[${personIndex}].events[${eventIndex}].detail`,
      ),
    };
  });
}

function parseField(value: unknown, fieldPath: string): KosekiField {
  if (!value || typeof value !== "object") {
    throw new Error(`Claude Vision payload ${fieldPath} must be an object`);
  }

  const field = value as Partial<KosekiField>;

  if (typeof field.value !== "string") {
    throw new Error(`Claude Vision payload ${fieldPath}.value must be a string`);
  }

  if (field.rawText !== undefined && typeof field.rawText !== "string") {
    throw new Error(`Claude Vision payload ${fieldPath}.rawText must be a string`);
  }

  return {
    value: field.value,
    confidence: parseConfidence(field.confidence, `${fieldPath}.confidence`),
    rawText: field.rawText,
  };
}

function parseWarnings(value: unknown): OcrWarning[] {
  if (!Array.isArray(value)) {
    throw new Error("Claude Vision payload warnings must be an array");
  }

  return value.map((warning, warningIndex) => {
    if (!warning || typeof warning !== "object") {
      throw new Error(`Claude Vision payload warnings[${warningIndex}] must be an object`);
    }

    const typedWarning = warning as Partial<OcrWarning>;

    if (typeof typedWarning.code !== "string") {
      throw new Error(
        `Claude Vision payload warnings[${warningIndex}].code must be a string`,
      );
    }

    if (typeof typedWarning.message !== "string") {
      throw new Error(
        `Claude Vision payload warnings[${warningIndex}].message must be a string`,
      );
    }

    if (typedWarning.field !== undefined && typeof typedWarning.field !== "string") {
      throw new Error(
        `Claude Vision payload warnings[${warningIndex}].field must be a string`,
      );
    }

    return {
      code: typedWarning.code,
      message: typedWarning.message,
      field: typedWarning.field,
    };
  });
}

function parseConfidence(value: unknown, fieldPath: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Claude Vision payload ${fieldPath} must be between 0 and 1`);
  }

  return value;
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
