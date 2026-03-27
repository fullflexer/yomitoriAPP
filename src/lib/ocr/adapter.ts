import type { KosekiField, OcrInput, OcrProvider, OcrResult } from "@/lib/ocr/types";

const DEFAULT_MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 250;

export class OcrAdapter {
  constructor(private readonly provider: OcrProvider) {}

  extract(input: OcrInput) {
    return this.provider.extract(input);
  }

  async extractWithRetry(
    input: OcrInput,
    maxRetries = DEFAULT_MAX_RETRIES,
  ): Promise<OcrResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.provider.extract(input);
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        const delayMs = BASE_RETRY_DELAY_MS * 2 ** attempt;
        await sleep(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("OCR extraction failed");
  }

  async extractWithValidation(input: OcrInput): Promise<OcrResult> {
    const result = await this.provider.extract(input);

    assertValidOcrResult(result);

    return result;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertValidOcrResult(result: OcrResult) {
  if (typeof result.rawText !== "string") {
    throw new Error("Invalid OCR result: rawText must be a string");
  }

  if (!result.fields || typeof result.fields !== "object") {
    throw new Error("Invalid OCR result: fields are required");
  }

  assertValidField(result.fields.headOfHousehold, "fields.headOfHousehold");
  assertValidField(result.fields.registeredAddress, "fields.registeredAddress");

  if (!Array.isArray(result.fields.persons)) {
    throw new Error("Invalid OCR result: fields.persons must be an array");
  }

  result.fields.persons.forEach((person, personIndex) => {
    assertValidField(person.name, `fields.persons[${personIndex}].name`);
    if (person.relationship !== undefined) {
      assertValidField(person.relationship, `fields.persons[${personIndex}].relationship`);
    }
    assertValidField(person.birthDate, `fields.persons[${personIndex}].birthDate`);
    if (person.deathDate !== undefined) {
      assertValidField(person.deathDate, `fields.persons[${personIndex}].deathDate`);
    }

    if (person.gender !== undefined) {
      assertValidField(person.gender, `fields.persons[${personIndex}].gender`);
    }

    if (!Array.isArray(person.events)) {
      throw new Error(
        `Invalid OCR result: fields.persons[${personIndex}].events must be an array`,
      );
    }

    person.events.forEach((event, eventIndex) => {
      if (typeof event.type !== "string") {
        throw new Error(
          `Invalid OCR result: fields.persons[${personIndex}].events[${eventIndex}].type must be a string`,
        );
      }

      assertValidField(
        event.date,
        `fields.persons[${personIndex}].events[${eventIndex}].date`,
      );
      assertValidField(
        event.detail,
        `fields.persons[${personIndex}].events[${eventIndex}].detail`,
      );
    });
  });

  if (!isConfidence(result.confidence)) {
    throw new Error("Invalid OCR result: confidence must be a number between 0 and 1");
  }

  if (!Array.isArray(result.warnings)) {
    throw new Error("Invalid OCR result: warnings must be an array");
  }

  result.warnings.forEach((warning, warningIndex) => {
    if (typeof warning.code !== "string") {
      throw new Error(
        `Invalid OCR result: warnings[${warningIndex}].code must be a string`,
      );
    }

    if (typeof warning.message !== "string") {
      throw new Error(
        `Invalid OCR result: warnings[${warningIndex}].message must be a string`,
      );
    }

    if (warning.field !== undefined && typeof warning.field !== "string") {
      throw new Error(
        `Invalid OCR result: warnings[${warningIndex}].field must be a string`,
      );
    }
  });

  if (
    result.tokensUsed !== undefined &&
    (!Number.isFinite(result.tokensUsed) || result.tokensUsed < 0)
  ) {
    throw new Error("Invalid OCR result: tokensUsed must be a non-negative number");
  }

  if (!Number.isFinite(result.processingTimeMs) || result.processingTimeMs < 0) {
    throw new Error("Invalid OCR result: processingTimeMs must be a non-negative number");
  }
}

function assertValidField(field: KosekiField, fieldPath: string) {
  if (!field || typeof field !== "object") {
    throw new Error(`Invalid OCR result: ${fieldPath} is required`);
  }

  if (typeof field.value !== "string") {
    throw new Error(`Invalid OCR result: ${fieldPath}.value must be a string`);
  }

  if (!isConfidence(field.confidence)) {
    throw new Error(
      `Invalid OCR result: ${fieldPath}.confidence must be a number between 0 and 1`,
    );
  }

  if (field.rawText !== undefined && typeof field.rawText !== "string") {
    throw new Error(`Invalid OCR result: ${fieldPath}.rawText must be a string`);
  }
}

function isConfidence(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
