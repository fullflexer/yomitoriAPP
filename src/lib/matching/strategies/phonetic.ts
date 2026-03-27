import { normalizeJapaneseName } from "./normalized";

function normalizeKana(raw: string): string {
  return normalizeJapaneseName(raw).replace(/\s+/g, "");
}

export function phoneticMatch(
  a: string,
  b: string,
  kanaA?: string,
  kanaB?: string,
): number {
  if (!kanaA || !kanaB) {
    return 0;
  }

  const normalizedKanaA = normalizeKana(kanaA);
  const normalizedKanaB = normalizeKana(kanaB);

  if (!normalizedKanaA || normalizedKanaA !== normalizedKanaB) {
    return 0;
  }

  const normalizedNameA = normalizeJapaneseName(a).replace(/\s+/g, "");
  const normalizedNameB = normalizeJapaneseName(b).replace(/\s+/g, "");

  return normalizedNameA && normalizedNameA === normalizedNameB ? 0.9 : 0.7;
}
