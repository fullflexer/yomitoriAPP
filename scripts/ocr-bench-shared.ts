import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type GoldField = {
  value: string;
  confidence: number;
  rawText?: string;
  id?: string;
  key?: string;
  personId?: string;
  label?: string;
  page?: number;
};

export type GoldEventField = {
  type: string;
  date: GoldField;
  detail: GoldField;
  eventTypeHint?: string;
  counterpartName?: string;
};

export type GoldPersonField = {
  name: GoldField;
  relationship?: GoldField;
  birthDate: GoldField;
  deathDate?: GoldField;
  gender?: GoldField;
  address?: GoldField;
  events: GoldEventField[];
};

export type GoldFixture = {
  headOfHousehold: GoldField;
  registeredAddress: GoldField;
  persons: GoldPersonField[];
};

export type BenchOcrResult = {
  rawText: string;
  fields: GoldFixture;
  confidence: number;
  warnings: Array<{
    code: string;
    message: string;
    field?: string;
  }>;
  tokensUsed?: number;
  processingTimeMs: number;
};

export const PROJECT_ROOT = process.cwd();
export const GOLD_STANDARD_DIR = path.join(
  PROJECT_ROOT,
  "tests",
  "fixtures",
  "gold-standard",
);

export function listGoldFixtureBaseNames() {
  return readdirSync(GOLD_STANDARD_DIR)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => entry.replace(/\.json$/, ""));
}

export function loadGoldFixture(baseName: string): GoldFixture {
  const fixturePath = path.join(GOLD_STANDARD_DIR, `${baseName}.json`);
  return JSON.parse(readFileSync(fixturePath, "utf8")) as GoldFixture;
}

export function buildFixtureRawText(fixture: GoldFixture) {
  const lines = [
    `筆頭者 ${fixture.headOfHousehold.value}`,
    `本籍 ${fixture.registeredAddress.value}`,
  ];

  fixture.persons.forEach((person, index) => {
    const parts = [
      `${index + 1}`,
      person.relationship?.value ?? "",
      person.name.value,
      person.birthDate.value,
      person.deathDate?.value ?? "",
      person.gender?.value ?? "",
      person.address?.value ?? "",
      person.events.map((event) => `${event.date.value} ${event.detail.value}`).join(" / "),
    ].filter(Boolean);

    lines.push(parts.join(" | "));
  });

  return lines.join("\n");
}

export function buildMockOcrResult(fixture: GoldFixture): BenchOcrResult {
  return {
    rawText: buildFixtureRawText(fixture),
    fields: fixture,
    confidence: 1,
    warnings: [],
    tokensUsed: 0,
    processingTimeMs: 0,
  };
}

export function normalizeComparisonValue(value: string | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function csvEscape(value: string | number | boolean) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function markdownEscape(value: string) {
  return value.replaceAll("|", "\\|");
}
