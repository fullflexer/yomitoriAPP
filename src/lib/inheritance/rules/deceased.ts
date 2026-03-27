import type { FamilyGraph, Person } from "../types";

export type DeceasedLookupResult = {
  deceased: Person | null;
  warnings: string[];
};

export function findDeceased(
  graph: FamilyGraph,
  deceasedId: string,
): DeceasedLookupResult {
  const deceased = graph.persons.find((person) => person.id === deceasedId) ?? null;

  if (!deceased) {
    return {
      deceased: null,
      warnings: [`Person "${deceasedId}" was not found in the family graph.`],
    };
  }

  if (!deceased.deathDate) {
    return {
      deceased,
      warnings: [
        `Person "${deceasedId}" is treated as deceased, but deathDate is missing.`,
      ],
    };
  }

  return {
    deceased,
    warnings: [],
  };
}
