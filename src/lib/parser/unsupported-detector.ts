import type { KosekiField, OcrResult } from "../ocr/types";

const HANDWRITING_CONFIDENCE_THRESHOLD = 0.3;
const HANDWRITING_LOW_FIELD_COUNT = 3;
const HANDWRITING_LOW_FIELD_RATIO = 0.4;

const ADOPTION_PATTERN = /養子縁組|特別養子|普通養子|養子|離縁/u;
const FOREIGN_NATIONALITY_PATTERN =
  /外国籍|(?<!本)国籍|帰化|無国籍|二重国籍|米国籍|韓国籍|中国籍|台湾籍|フィリピン国籍|ブラジル国籍/u;

function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenFields(ocrResult: OcrResult): KosekiField[] {
  const flattened: KosekiField[] = [
    ocrResult.fields.headOfHousehold,
    ocrResult.fields.registeredAddress,
  ];

  for (const person of ocrResult.fields.persons) {
    flattened.push(person.name, person.birthDate);

    if (person.gender) {
      flattened.push(person.gender);
    }

    if (person.address) {
      flattened.push(person.address);
    }

    for (const event of person.events) {
      flattened.push(event.date, event.detail);
    }
  }

  return flattened;
}

export function detectUnsupported(ocrResult: OcrResult): string[] {
  const reasons = new Set<string>();
  const normalizedDocumentType = normalizeText(ocrResult.documentType ?? "");
  const flattenedFields = flattenFields(ocrResult);
  const lowConfidenceFields = flattenedFields.filter(
    (field) => field.confidence < HANDWRITING_CONFIDENCE_THRESHOLD,
  );

  if (
    lowConfidenceFields.length >= HANDWRITING_LOW_FIELD_COUNT &&
    lowConfidenceFields.length / Math.max(flattenedFields.length, 1) >=
      HANDWRITING_LOW_FIELD_RATIO
  ) {
    reasons.add(
      "Handwritten or heavily degraded text was detected from many very low-confidence OCR fields.",
    );
  }

  if (
    normalizedDocumentType === "original_koseki" ||
    normalizedDocumentType === "removed_koseki" ||
    normalizedDocumentType.includes("改製原戸籍") ||
    normalizedDocumentType.includes("原戸籍")
  ) {
    reasons.add("Reformatted or original koseki documents are unsupported.");
  }

  for (const field of flattenedFields) {
    const haystack = normalizeText(
      [field.label, field.rawText, field.value].filter(Boolean).join(" "),
    );

    if (ADOPTION_PATTERN.test(haystack)) {
      reasons.add("Adoption-related entries are unsupported in the MVP parser.");
    }

    if (FOREIGN_NATIONALITY_PATTERN.test(haystack)) {
      reasons.add("Foreign nationality-related entries are unsupported.");
    }
  }

  if (FOREIGN_NATIONALITY_PATTERN.test(normalizeText(ocrResult.rawText))) {
    reasons.add("Foreign nationality-related entries are unsupported.");
  }

  return [...reasons];
}
