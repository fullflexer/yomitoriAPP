import type { Heir, Person } from "./types";

function uniquePeople(people: Person[]): Person[] {
  const seen = new Set<string>();
  const unique: Person[] = [];

  for (const person of people) {
    if (seen.has(person.id)) {
      continue;
    }

    seen.add(person.id);
    unique.push(person);
  }

  return unique;
}

export function calculateShares(
  spouse: Person | null,
  children: Person[],
): Heir[] {
  const normalizedChildren = uniquePeople(
    spouse ? children.filter((child) => child.id !== spouse.id) : children,
  );

  if (spouse && normalizedChildren.length > 0) {
    return [
      {
        personId: spouse.id,
        heirClass: "spouse",
        shareNumerator: 1,
        shareDenominator: 2,
      },
      ...normalizedChildren.map((child) => ({
        personId: child.id,
        heirClass: "class1" as const,
        shareNumerator: 1,
        shareDenominator: 2 * normalizedChildren.length,
      })),
    ];
  }

  if (spouse) {
    return [
      {
        personId: spouse.id,
        heirClass: "spouse",
        shareNumerator: 1,
        shareDenominator: 1,
      },
    ];
  }

  if (normalizedChildren.length > 0) {
    return normalizedChildren.map((child) => ({
      personId: child.id,
      heirClass: "class1" as const,
      shareNumerator: 1,
      shareDenominator: normalizedChildren.length,
    }));
  }

  return [];
}
