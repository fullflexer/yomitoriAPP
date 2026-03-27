import type { ParsedPerson } from "../parser/types";
import { combineScores } from "./confidence-scorer";
import { exactMatch } from "./strategies/exact";
import { normalizedMatch } from "./strategies/normalized";
import { phoneticMatch } from "./strategies/phonetic";
import type { MatchCandidate, MatchResult, MatchStrategy } from "./types";

const MATCH_THRESHOLD = 0.9;
const REVIEW_THRESHOLD = 0.5;

function buildCandidate(personA: ParsedPerson, personB: ParsedPerson): MatchCandidate | null {
  const exactScore = exactMatch(personA.fullName, personB.fullName);

  if (exactScore > 0) {
    return {
      personA: personA.id,
      personB: personB.id,
      strategy: "exact",
      confidence: combineScores([{ strategy: "exact", score: exactScore }]),
    };
  }

  const normalizedScore = normalizedMatch(personA.fullName, personB.fullName);
  const phoneticScore = phoneticMatch(
    personA.fullName,
    personB.fullName,
    personA.fullNameKana,
    personB.fullNameKana,
  );
  const scoredStrategies: Array<{ strategy: MatchStrategy; score: number }> = [
    { strategy: "normalized", score: normalizedScore },
    { strategy: "phonetic", score: phoneticScore },
  ];
  const confidence = combineScores(scoredStrategies);

  if (confidence === 0) {
    return null;
  }

  const winningStrategy =
    scoredStrategies.find((entry) => entry.score === confidence)?.strategy ?? "normalized";

  return {
    personA: personA.id,
    personB: personB.id,
    strategy: winningStrategy,
    confidence,
  };
}

function strategyPriority(strategy: MatchStrategy): number {
  switch (strategy) {
    case "exact":
      return 0;
    case "normalized":
      return 1;
    case "phonetic":
      return 2;
  }
}

function compareCandidates(a: MatchCandidate, b: MatchCandidate): number {
  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence;
  }

  const strategyDifference = strategyPriority(a.strategy) - strategyPriority(b.strategy);

  if (strategyDifference !== 0) {
    return strategyDifference;
  }

  const personAComparison = a.personA.localeCompare(b.personA, "ja");

  if (personAComparison !== 0) {
    return personAComparison;
  }

  return a.personB.localeCompare(b.personB, "ja");
}

export function matchPersons(persons: ParsedPerson[]): MatchResult {
  const candidates: MatchCandidate[] = [];

  for (let indexA = 0; indexA < persons.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < persons.length; indexB += 1) {
      const candidate = buildCandidate(persons[indexA], persons[indexB]);

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  const sortedCandidates = [...candidates].sort(compareCandidates);
  const matchedIds = new Set<string>();
  const reviewIds = new Set<string>();
  const matches: MatchCandidate[] = [];
  const requiresReview: MatchCandidate[] = [];

  for (const candidate of sortedCandidates) {
    if (matchedIds.has(candidate.personA) || matchedIds.has(candidate.personB)) {
      continue;
    }

    if (candidate.confidence >= MATCH_THRESHOLD) {
      matches.push(candidate);
      matchedIds.add(candidate.personA);
      matchedIds.add(candidate.personB);
      continue;
    }

    if (
      candidate.confidence >= REVIEW_THRESHOLD &&
      !reviewIds.has(candidate.personA) &&
      !reviewIds.has(candidate.personB)
    ) {
      requiresReview.push(candidate);
      reviewIds.add(candidate.personA);
      reviewIds.add(candidate.personB);
    }
  }

  const unresolvedIds = new Set<string>([...matchedIds, ...reviewIds]);
  const unmatched = persons
    .map((person) => person.id)
    .filter((personId) => !unresolvedIds.has(personId));

  return {
    matches,
    unmatched,
    requiresReview,
  };
}
