import { findChildren } from "./rules/children";
import { findDeceased } from "./rules/deceased";
import { findSpouse } from "./rules/spouse";
import { calculateShares } from "./share-calculator";
import type { FamilyGraph, InheritanceResult, Person } from "./types";
import { detectUnsupported } from "./unsupported-cases";

function parseDate(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function survivedDeceased(candidate: Person, deceased: Person): boolean {
  const deceasedDeath = parseDate(deceased.deathDate);
  const candidateDeath = parseDate(candidate.deathDate);

  if (deceasedDeath === null || candidateDeath === null) {
    return true;
  }

  return candidateDeath > deceasedDeath;
}

function blocksDeterministicShareCalculation(unsupportedCase: string): boolean {
  // These cases change who participates in the same heir class, so a partial
  // spouse/child-only calculation would be more misleading than returning none.
  return (
    unsupportedCase.includes("adoption or complex parentage") ||
    unsupportedCase.includes("divorce/remarriage history") ||
    unsupportedCase.includes("representation inheritance")
  );
}

export function determineHeirs(
  graph: FamilyGraph,
  deceasedId: string,
): InheritanceResult {
  const { deceased, warnings } = findDeceased(graph, deceasedId);

  if (!deceased) {
    return {
      deceasedId,
      heirs: [],
      unsupportedCases: detectUnsupported(graph, deceasedId),
      warnings,
    };
  }

  const spouse = findSpouse(graph, deceasedId);
  const eligibleSpouse =
    spouse && spouse.id !== deceasedId && survivedDeceased(spouse, deceased)
      ? spouse
      : null;
  const children = findChildren(graph, deceasedId).filter(
    (child) => child.id !== deceasedId && survivedDeceased(child, deceased),
  );
  const unsupportedCases = detectUnsupported(graph, deceasedId);
  const heirs = unsupportedCases.some(blocksDeterministicShareCalculation)
    ? []
    : calculateShares(eligibleSpouse, children);

  return {
    deceasedId,
    heirs,
    unsupportedCases,
    warnings,
  };
}
