import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import {
  GOLD_STANDARD_DIR,
  PROJECT_ROOT,
  buildMockOcrResult,
  csvEscape,
  type BenchOcrResult,
  type GoldField,
  type GoldFixture,
  markdownEscape,
  normalizeComparisonValue,
  listGoldFixtureBaseNames,
  loadGoldFixture,
} from "./ocr-bench-shared.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const PASS_THRESHOLD = 0.9;

type CliOptions = {
  mock: boolean;
  outputPath?: string;
};

type ComparedField = "name" | "birthDate" | "relationship" | "deathDate";

type CsvRow = {
  fixture: string;
  personIndex: number;
  nameExpected: string;
  nameActual: string;
  nameMatch: boolean;
  birthDateExpected: string;
  birthDateActual: string;
  birthDateMatch: boolean;
  relationshipExpected: string;
  relationshipActual: string;
  relationshipMatch: boolean;
  deathDateExpected: string;
  deathDateActual: string;
  deathDateMatch: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const basenames = listGoldFixtureBaseNames();
  const rows: CsvRow[] = [];
  const totals = {
    name: { matched: 0, total: 0 },
    birthDate: { matched: 0, total: 0 },
    relationship: { matched: 0, total: 0 },
    deathDate: { matched: 0, total: 0 },
  };
  const perDocument: Array<{
    fixture: string;
    people: number;
    name: number;
    birthDate: number;
    relationship: number;
    deathDate: number;
  }> = [];

  for (const baseName of basenames) {
    const fixture = loadGoldFixture(baseName);
    const imagePath = path.join(GOLD_STANDARD_DIR, `${baseName}.png`);
    const result = options.mock
      ? buildMockOcrResult(fixture)
      : await extractWithClaudeVision(imagePath);

    const compared = compareFixture(baseName, fixture, result.fields);
    rows.push(...compared.rows);
    addTotals(totals, compared.rows);

    perDocument.push({
      fixture: baseName,
      people: fixture.persons.length,
      name: fieldRate(compared.rows, "name"),
      birthDate: fieldRate(compared.rows, "birthDate"),
      relationship: fieldRate(compared.rows, "relationship"),
      deathDate: fieldRate(compared.rows, "deathDate"),
    });
  }

  const summary = {
    name: rate(totals.name.matched, totals.name.total),
    birthDate: rate(totals.birthDate.matched, totals.birthDate.total),
    relationship: rate(totals.relationship.matched, totals.relationship.total),
    deathDate: rate(totals.deathDate.matched, totals.deathDate.total),
  };
  const average =
    (summary.name + summary.birthDate + summary.relationship + summary.deathDate) / 4;
  const passed = average >= PASS_THRESHOLD;

  printCsv(rows);
  printSummary(options.mock ? "MockProvider" : DEFAULT_MODEL, summary, average, passed);

  if (options.outputPath) {
    writeMarkdownReport(
      options.outputPath,
      options.mock ? "MockProvider" : DEFAULT_MODEL,
      summary,
      average,
      passed,
      perDocument,
    );
  }

  process.exitCode = passed ? 0 : 1;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mock: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--mock") {
      options.mock = true;
      continue;
    }

    if (arg === "--output") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--output requires a file path");
      }
      options.outputPath = path.resolve(PROJECT_ROOT, value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function extractWithClaudeVision(imagePath: string): Promise<BenchOcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required unless --mock is used.");
  }

  const client = new Anthropic({ apiKey });
  const imageBuffer = readFileSync(imagePath);
  const startedAt = Date.now();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: buildPrompt(),
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
    throw new Error(`Claude Vision returned no text for ${path.basename(imagePath)}`);
  }

  const parsed = parseClaudePayload(responseText);

  return {
    rawText: parsed.rawText,
    fields: parsed.fields,
    confidence: parsed.confidence,
    warnings: parsed.warnings,
    processingTimeMs: Date.now() - startedAt,
    tokensUsed: getTotalTokens(response.usage),
  };
}

function buildPrompt() {
  return [
    "You are an OCR extraction engine for Japanese computerized koseki documents.",
    "Return valid JSON only.",
    'Use this exact shape: {"rawText":string,"fields":{"headOfHousehold":{"value":string,"confidence":number},"registeredAddress":{"value":string,"confidence":number},"persons":[{"name":{"value":string,"confidence":number},"relationship":{"value":string,"confidence":number},"birthDate":{"value":string,"confidence":number},"deathDate":{"value":string,"confidence":number},"gender":{"value":string,"confidence":number},"address":{"value":string,"confidence":number},"events":[{"type":string,"date":{"value":string,"confidence":number},"detail":{"value":string,"confidence":number}}]}]},"confidence":number,"warnings":[{"code":string,"message":string,"field"?:string}]}',
    "Preserve Japanese text exactly, including era-based dates and relationship labels.",
    "For living people, use an empty string for deathDate.value.",
    "Do not add or remove people.",
  ].join("\n");
}

function parseClaudePayload(responseText: string): BenchOcrResult {
  const parsed = JSON.parse(extractJsonObject(responseText)) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Claude payload must be a JSON object");
  }

  const payload = parsed as Partial<BenchOcrResult>;

  if (typeof payload.rawText !== "string") {
    throw new Error("Claude payload missing rawText");
  }

  return {
    rawText: payload.rawText,
    fields: parseFixture(payload.fields),
    confidence: parseConfidence(payload.confidence),
    warnings: parseWarnings(payload.warnings),
    processingTimeMs: 0,
  };
}

function extractJsonObject(responseText: string) {
  const fencedMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? responseText.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("Claude response did not include a JSON object");
  }

  return candidate.slice(start, end + 1);
}

function parseFixture(value: unknown): GoldFixture {
  if (!value || typeof value !== "object") {
    throw new Error("Claude payload missing fields");
  }

  const fixture = value as Partial<GoldFixture>;

  if (!Array.isArray(fixture.persons)) {
    throw new Error("Claude payload fields.persons must be an array");
  }

  return {
    headOfHousehold: parseField(fixture.headOfHousehold),
    registeredAddress: parseField(fixture.registeredAddress),
    persons: fixture.persons.map((person) => {
      if (!person || typeof person !== "object") {
        throw new Error("Claude payload person must be an object");
      }

      const typedPerson = person as GoldFixture["persons"][number];

      return {
        name: parseField(typedPerson.name),
        relationship: parseOptionalField(typedPerson.relationship),
        birthDate: parseField(typedPerson.birthDate),
        deathDate: parseOptionalField(typedPerson.deathDate),
        gender: parseOptionalField(typedPerson.gender),
        address: parseOptionalField(typedPerson.address),
        events: Array.isArray(typedPerson.events)
          ? typedPerson.events.map((event) => ({
              type: typeof event.type === "string" ? event.type : "",
              date: parseField(event.date),
              detail: parseField(event.detail),
            }))
          : [],
      };
    }),
  };
}

function parseField(value: unknown): GoldField {
  if (!value || typeof value !== "object") {
    throw new Error("Claude payload field must be an object");
  }

  const field = value as Partial<GoldField>;

  if (typeof field.value !== "string") {
    throw new Error("Claude payload field.value must be a string");
  }

  return {
    value: field.value,
    confidence: parseConfidence(field.confidence),
    rawText: field.rawText,
  };
}

function parseOptionalField(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = parseField(value);

  if (!normalizeComparisonValue(parsed.value)) {
    return undefined;
  }

  return parsed;
}

function parseWarnings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (warning): warning is { code: string; message: string; field?: string } =>
        Boolean(warning) &&
        typeof warning === "object" &&
        typeof (warning as { code?: unknown }).code === "string" &&
        typeof (warning as { message?: unknown }).message === "string",
    )
    .map((warning) => ({
      code: warning.code,
      message: warning.message,
      field: warning.field,
    }));
}

function parseConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function compareFixture(baseName: string, expected: GoldFixture, actual: GoldFixture) {
  const rows: CsvRow[] = [];
  const maxPeople = Math.max(expected.persons.length, actual.persons.length);

  for (let index = 0; index < maxPeople; index += 1) {
    const expectedPerson = expected.persons[index];
    const actualPerson = actual.persons[index];

    rows.push({
      fixture: baseName,
      personIndex: index + 1,
      nameExpected: normalizeComparisonValue(expectedPerson?.name.value),
      nameActual: normalizeComparisonValue(actualPerson?.name.value),
      nameMatch: matches(expectedPerson?.name.value, actualPerson?.name.value),
      birthDateExpected: normalizeComparisonValue(expectedPerson?.birthDate.value),
      birthDateActual: normalizeComparisonValue(actualPerson?.birthDate.value),
      birthDateMatch: matches(expectedPerson?.birthDate.value, actualPerson?.birthDate.value),
      relationshipExpected: normalizeComparisonValue(expectedPerson?.relationship?.value),
      relationshipActual: normalizeComparisonValue(actualPerson?.relationship?.value),
      relationshipMatch: matches(
        expectedPerson?.relationship?.value,
        actualPerson?.relationship?.value,
      ),
      deathDateExpected: normalizeComparisonValue(expectedPerson?.deathDate?.value),
      deathDateActual: normalizeComparisonValue(actualPerson?.deathDate?.value),
      deathDateMatch: matches(expectedPerson?.deathDate?.value, actualPerson?.deathDate?.value),
    });
  }

  return { rows };
}

function matches(expected: string | undefined, actual: string | undefined) {
  return normalizeComparisonValue(expected) === normalizeComparisonValue(actual);
}

function addTotals(
  totals: Record<ComparedField, { matched: number; total: number }>,
  rows: CsvRow[],
) {
  rows.forEach((row) => {
    totals.name.total += 1;
    totals.birthDate.total += 1;
    totals.relationship.total += 1;
    totals.deathDate.total += 1;

    totals.name.matched += Number(row.nameMatch);
    totals.birthDate.matched += Number(row.birthDateMatch);
    totals.relationship.matched += Number(row.relationshipMatch);
    totals.deathDate.matched += Number(row.deathDateMatch);
  });
}

function fieldRate(rows: CsvRow[], field: ComparedField) {
  const total = rows.length;

  if (total === 0) {
    return 0;
  }

  const matched = rows.filter((row) => row[`${field}Match` as const]).length;
  return matched / total;
}

function rate(matched: number, total: number) {
  if (total === 0) {
    return 0;
  }

  return matched / total;
}

function printCsv(rows: CsvRow[]) {
  const header = [
    "fixture",
    "personIndex",
    "nameExpected",
    "nameActual",
    "nameMatch",
    "birthDateExpected",
    "birthDateActual",
    "birthDateMatch",
    "relationshipExpected",
    "relationshipActual",
    "relationshipMatch",
    "deathDateExpected",
    "deathDateActual",
    "deathDateMatch",
  ];

  console.log(header.join(","));
  rows.forEach((row) => {
    console.log(
      [
        row.fixture,
        row.personIndex,
        row.nameExpected,
        row.nameActual,
        row.nameMatch,
        row.birthDateExpected,
        row.birthDateActual,
        row.birthDateMatch,
        row.relationshipExpected,
        row.relationshipActual,
        row.relationshipMatch,
        row.deathDateExpected,
        row.deathDateActual,
        row.deathDateMatch,
      ]
        .map(csvEscape)
        .join(","),
    );
  });
}

function printSummary(
  providerLabel: string,
  summary: Record<ComparedField, number>,
  average: number,
  passed: boolean,
) {
  console.log("");
  console.log(`provider,${providerLabel}`);
  console.log(`name_accuracy,${formatPercent(summary.name)}`);
  console.log(`birthDate_accuracy,${formatPercent(summary.birthDate)}`);
  console.log(`relationship_accuracy,${formatPercent(summary.relationship)}`);
  console.log(`deathDate_accuracy,${formatPercent(summary.deathDate)}`);
  console.log(`average_accuracy,${formatPercent(average)}`);
  console.log(`threshold,${formatPercent(PASS_THRESHOLD)}`);
  console.log(`status,${passed ? "PASS" : "FAIL"}`);
}

function writeMarkdownReport(
  outputPath: string,
  providerLabel: string,
  summary: Record<ComparedField, number>,
  average: number,
  passed: boolean,
  perDocument: Array<{
    fixture: string;
    people: number;
    name: number;
    birthDate: number;
    relationship: number;
    deathDate: number;
  }>,
) {
  const now = new Date().toISOString();
  const lines = [
    "---",
    "title: OCR Benchmark Results",
    "app: yomitoriAPP",
    `status: ${passed ? "pass" : "fail"}`,
    `updated: ${now.slice(0, 10)}`,
    "scope: benchmark",
    "related_docs:",
    "  - tests/fixtures/gold-standard/README.md",
    "  - docs/roadmap.md",
    "---",
    "",
    "# OCR Benchmark Results",
    "",
    `- Provider: \`${providerLabel}\``,
    `- Generated at: \`${now}\``,
    `- Threshold: \`${formatPercent(PASS_THRESHOLD)}\``,
    `- Result: \`${passed ? "PASS" : "FAIL"}\``,
    "",
    "## Summary",
    "",
    "| Field | Accuracy |",
    "| --- | --- |",
    `| Name | ${formatPercent(summary.name)} |`,
    `| Birth date | ${formatPercent(summary.birthDate)} |`,
    `| Relationship | ${formatPercent(summary.relationship)} |`,
    `| Death date | ${formatPercent(summary.deathDate)} |`,
    `| Average | ${formatPercent(average)} |`,
    "",
    "## Per Fixture",
    "",
    "| Fixture | People | Name | Birth date | Relationship | Death date |",
    "| --- | --- | --- | --- | --- | --- |",
    ...perDocument.map(
      (entry) =>
        `| ${markdownEscape(entry.fixture)} | ${entry.people} | ${formatPercent(entry.name)} | ${formatPercent(entry.birthDate)} | ${formatPercent(entry.relationship)} | ${formatPercent(entry.deathDate)} |`,
    ),
    "",
  ];

  writeFileSync(outputPath, lines.join("\n"));
}

function getTotalTokens(
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

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
