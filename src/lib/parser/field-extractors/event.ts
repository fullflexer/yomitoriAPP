import type { KosekiEventField } from "../../ocr/types";
import type { ParsedEvent, ParsedEventType } from "../types";
import { convertWareki } from "./date";
import { normalizeNameText } from "./name";

function normalizeEventText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function inferEventType(field: KosekiEventField): ParsedEventType {
  const haystack = normalizeEventText(
    [field.type, field.detail.value, field.detail.rawText].filter(Boolean).join(" "),
  );

  if (haystack.includes("birth") || haystack.includes("出生")) {
    return "birth";
  }

  if (haystack.includes("death") || haystack.includes("死亡")) {
    return "death";
  }

  if (haystack.includes("divorce") || haystack.includes("離婚")) {
    return "divorce";
  }

  if (haystack.includes("marriage") || haystack.includes("婚姻")) {
    return "marriage";
  }

  if (haystack.includes("disadoption") || haystack.includes("離縁")) {
    return "disadoption";
  }

  if (haystack.includes("adoption") || haystack.includes("養子")) {
    return "adoption";
  }

  if (haystack.includes("recognition") || haystack.includes("認知")) {
    return "recognition";
  }

  if (haystack.includes("transfer") || haystack.includes("転籍") || haystack.includes("分籍")) {
    return "transfer";
  }

  return "other";
}

function extractCounterpartName(
  field: KosekiEventField,
  type: ParsedEventType,
): string | undefined {
  if (field.counterpartName) {
    return normalizeNameText(field.counterpartName);
  }

  const detail = normalizeEventText(field.detail.rawText ?? field.detail.value);
  const patterns: Record<
    Exclude<ParsedEventType, "birth" | "death" | "transfer" | "other">,
    RegExp[]
  > = {
    marriage: [/(.+?)と婚姻/u],
    divorce: [/(.+?)と離婚/u],
    adoption: [/(.+?)(?:を|との)養子(?:縁組)?/u],
    disadoption: [/(.+?)(?:と|との)離縁/u],
    recognition: [/(.+?)を認知/u],
  };

  if (!(type in patterns)) {
    return undefined;
  }

  for (const pattern of patterns[type as keyof typeof patterns]) {
    const match = detail.match(pattern);

    if (match?.[1]) {
      return normalizeNameText(match[1]);
    }
  }

  return undefined;
}

export function parseEvent(field: KosekiEventField): ParsedEvent {
  const detail = normalizeEventText(field.detail.rawText ?? field.detail.value);
  const type = inferEventType(field);
  const dateRawValue = normalizeEventText(field.date.rawText ?? field.date.value);
  const dateRaw = dateRawValue || undefined;
  const date = dateRaw ? convertWareki(dateRaw) ?? undefined : undefined;

  return {
    type,
    date,
    dateRaw,
    detail,
    counterpartName: extractCounterpartName(field, type),
    confidence: Math.min(field.date.confidence, field.detail.confidence),
  };
}
