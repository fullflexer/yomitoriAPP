const DASH_PATTERN = /[‐‑‒–—―ー−]/g;

export function normalizeAddress(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(DASH_PATTERN, "-")
    .replace(/\s+/g, " ")
    .replace(/(\d+)\s*丁目/g, "$1丁目")
    .replace(/(\d+)\s*番地\s*(\d+)/g, "$1番$2")
    .replace(/(\d+)\s*番地/g, "$1番")
    .replace(/(\d+)\s*番/g, "$1番")
    .replace(/(\d+)\s*号/g, "$1号")
    .replace(/(\d+)\s*-\s*(\d+)/g, "$1-$2")
    .trim();
}
