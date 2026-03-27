import type { KosekiField } from "../../ocr/types";

const KANA_IN_PARENS_PATTERN =
  /^(?<name>.+?)[(（]\s*(?<kana>[\p{Script=Katakana}\u30fc\s]+)\s*[)）]$/u;

export function normalizeNameText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractName(
  field: KosekiField,
): { fullName: string; fullNameKana?: string } {
  const normalized = normalizeNameText(field.value);

  if (!normalized) {
    return { fullName: "" };
  }

  const match = normalized.match(KANA_IN_PARENS_PATTERN);

  if (!match?.groups) {
    return { fullName: normalized };
  }

  const fullName = normalizeNameText(match.groups.name);
  const fullNameKana = normalizeNameText(match.groups.kana);

  return fullNameKana ? { fullName, fullNameKana } : { fullName };
}
