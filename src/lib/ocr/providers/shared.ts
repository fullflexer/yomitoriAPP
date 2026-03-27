import type {
  KosekiEventField,
  KosekiField,
  KosekiFields,
  KosekiPersonField,
  OcrResult,
  OcrWarning,
} from "@/lib/ocr/types";

type ParsedOcrPayload = Omit<OcrResult, "documentType" | "processingTimeMs" | "tokensUsed">;

type ParseOcrPayloadOptions = {
  providerName: string;
  defaultConfidence?: number;
};

export function parseOcrPayload(
  responseText: string,
  options: ParseOcrPayloadOptions,
): ParsedOcrPayload {
  const providerName = options.providerName;
  const jsonCandidate = extractJsonObject(responseText, providerName);
  const parsed = JSON.parse(jsonCandidate) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${providerName} payload must be a JSON object`);
  }

  const payload = parsed as Partial<ParsedOcrPayload>;

  if (typeof payload.rawText !== "string") {
    throw new Error(`${providerName} payload is missing rawText`);
  }

  return {
    rawText: payload.rawText,
    fields: parseFields(payload.fields, providerName),
    confidence: parseConfidence(
      payload.confidence,
      "confidence",
      providerName,
      options.defaultConfidence,
    ),
    warnings: parseWarnings(payload.warnings, providerName),
  };
}

function extractJsonObject(responseText: string, providerName: string) {
  const fencedMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? responseText.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`${providerName} response did not contain a JSON object`);
  }

  return candidate.slice(start, end + 1);
}

function parseFields(value: unknown, providerName: string): KosekiFields {
  if (!value || typeof value !== "object") {
    throw new Error(`${providerName} payload is missing fields`);
  }

  const fields = value as Partial<KosekiFields>;

  return {
    headOfHousehold: parseField(
      fields.headOfHousehold,
      "fields.headOfHousehold",
      providerName,
    ),
    registeredAddress: parseField(
      fields.registeredAddress,
      "fields.registeredAddress",
      providerName,
    ),
    persons: parsePersons(fields.persons, providerName),
  };
}

function parsePersons(value: unknown, providerName: string): KosekiPersonField[] {
  if (!Array.isArray(value)) {
    throw new Error(`${providerName} payload fields.persons must be an array`);
  }

  return value.map((person, personIndex) => {
    if (!person || typeof person !== "object") {
      throw new Error(
        `${providerName} payload fields.persons[${personIndex}] must be an object`,
      );
    }

    const typedPerson = person as Partial<KosekiPersonField>;

    return {
      name: parseField(typedPerson.name, `fields.persons[${personIndex}].name`, providerName),
      relationship:
        typedPerson.relationship === undefined
          ? undefined
          : parseField(
              typedPerson.relationship,
              `fields.persons[${personIndex}].relationship`,
              providerName,
            ),
      birthDate: parseField(
        typedPerson.birthDate,
        `fields.persons[${personIndex}].birthDate`,
        providerName,
      ),
      deathDate:
        typedPerson.deathDate === undefined
          ? undefined
          : parseField(
              typedPerson.deathDate,
              `fields.persons[${personIndex}].deathDate`,
              providerName,
            ),
      gender:
        typedPerson.gender === undefined
          ? undefined
          : parseField(
              typedPerson.gender,
              `fields.persons[${personIndex}].gender`,
              providerName,
            ),
      address:
        typedPerson.address === undefined
          ? undefined
          : parseField(
              typedPerson.address,
              `fields.persons[${personIndex}].address`,
              providerName,
            ),
      events: parseEvents(typedPerson.events, personIndex, providerName),
    };
  });
}

function parseEvents(
  value: unknown,
  personIndex: number,
  providerName: string,
): KosekiEventField[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${providerName} payload fields.persons[${personIndex}].events must be an array`,
    );
  }

  return value.map((event, eventIndex) => {
    if (!event || typeof event !== "object") {
      throw new Error(
        `${providerName} payload fields.persons[${personIndex}].events[${eventIndex}] must be an object`,
      );
    }

    const typedEvent = event as Partial<KosekiEventField>;

    if (typeof typedEvent.type !== "string") {
      throw new Error(
        `${providerName} payload fields.persons[${personIndex}].events[${eventIndex}].type must be a string`,
      );
    }

    if (
      typedEvent.eventTypeHint !== undefined &&
      typeof typedEvent.eventTypeHint !== "string"
    ) {
      throw new Error(
        `${providerName} payload fields.persons[${personIndex}].events[${eventIndex}].eventTypeHint must be a string`,
      );
    }

    if (
      typedEvent.counterpartName !== undefined &&
      typeof typedEvent.counterpartName !== "string"
    ) {
      throw new Error(
        `${providerName} payload fields.persons[${personIndex}].events[${eventIndex}].counterpartName must be a string`,
      );
    }

    return {
      type: typedEvent.type,
      date: parseField(
        typedEvent.date,
        `fields.persons[${personIndex}].events[${eventIndex}].date`,
        providerName,
      ),
      detail: parseField(
        typedEvent.detail,
        `fields.persons[${personIndex}].events[${eventIndex}].detail`,
        providerName,
      ),
      eventTypeHint: typedEvent.eventTypeHint,
      counterpartName: typedEvent.counterpartName,
    };
  });
}

function parseField(value: unknown, fieldPath: string, providerName: string): KosekiField {
  if (!value || typeof value !== "object") {
    throw new Error(`${providerName} payload ${fieldPath} must be an object`);
  }

  const field = value as Partial<KosekiField>;

  if (typeof field.value !== "string") {
    throw new Error(`${providerName} payload ${fieldPath}.value must be a string`);
  }

  if (field.rawText !== undefined && typeof field.rawText !== "string") {
    throw new Error(`${providerName} payload ${fieldPath}.rawText must be a string`);
  }

  if (field.id !== undefined && typeof field.id !== "string") {
    throw new Error(`${providerName} payload ${fieldPath}.id must be a string`);
  }

  if (field.key !== undefined && typeof field.key !== "string") {
    throw new Error(`${providerName} payload ${fieldPath}.key must be a string`);
  }

  if (field.personId !== undefined && typeof field.personId !== "string") {
    throw new Error(`${providerName} payload ${fieldPath}.personId must be a string`);
  }

  if (field.label !== undefined && typeof field.label !== "string") {
    throw new Error(`${providerName} payload ${fieldPath}.label must be a string`);
  }

  if (
    field.page !== undefined &&
    (!Number.isInteger(field.page) || !Number.isFinite(field.page) || field.page < 0)
  ) {
    throw new Error(`${providerName} payload ${fieldPath}.page must be a non-negative integer`);
  }

  return {
    value: field.value,
    confidence: parseConfidence(field.confidence, `${fieldPath}.confidence`, providerName),
    rawText: field.rawText,
    id: field.id,
    key: field.key,
    personId: field.personId,
    label: field.label,
    page: field.page,
  };
}

function parseWarnings(value: unknown, providerName: string): OcrWarning[] {
  if (!Array.isArray(value)) {
    throw new Error(`${providerName} payload warnings must be an array`);
  }

  return value.map((warning, warningIndex) => {
    if (!warning || typeof warning !== "object") {
      throw new Error(`${providerName} payload warnings[${warningIndex}] must be an object`);
    }

    const typedWarning = warning as Partial<OcrWarning>;

    if (typeof typedWarning.code !== "string") {
      throw new Error(
        `${providerName} payload warnings[${warningIndex}].code must be a string`,
      );
    }

    if (typeof typedWarning.message !== "string") {
      throw new Error(
        `${providerName} payload warnings[${warningIndex}].message must be a string`,
      );
    }

    if (typedWarning.field !== undefined && typeof typedWarning.field !== "string") {
      throw new Error(
        `${providerName} payload warnings[${warningIndex}].field must be a string`,
      );
    }

    return {
      code: typedWarning.code,
      message: typedWarning.message,
      field: typedWarning.field,
    };
  });
}

function parseConfidence(
  value: unknown,
  fieldPath: string,
  providerName: string,
  defaultValue?: number,
) {
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new Error(`${providerName} payload ${fieldPath} must be between 0 and 1`);
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${providerName} payload ${fieldPath} must be between 0 and 1`);
  }

  return value;
}
