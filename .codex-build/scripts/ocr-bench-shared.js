import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
export const PROJECT_ROOT = process.cwd();
export const GOLD_STANDARD_DIR = path.join(PROJECT_ROOT, "tests", "fixtures", "gold-standard");
export function listGoldFixtureBaseNames() {
    return readdirSync(GOLD_STANDARD_DIR)
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .map((entry) => entry.replace(/\.json$/, ""));
}
export function loadGoldFixture(baseName) {
    const fixturePath = path.join(GOLD_STANDARD_DIR, `${baseName}.json`);
    return JSON.parse(readFileSync(fixturePath, "utf8"));
}
export function buildFixtureRawText(fixture) {
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
export function buildMockOcrResult(fixture) {
    return {
        rawText: buildFixtureRawText(fixture),
        fields: fixture,
        confidence: 1,
        warnings: [],
        tokensUsed: 0,
        processingTimeMs: 0,
    };
}
export function normalizeComparisonValue(value) {
    return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
export function csvEscape(value) {
    const text = String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
}
export function markdownEscape(value) {
    return value.replaceAll("|", "\\|");
}
