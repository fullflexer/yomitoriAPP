import { findChildren } from "./rules/children";
import type { FamilyGraph, Person, Relationship } from "./types";

function parseDate(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function predeceasedCandidate(
  candidate: Person,
  deceased: Person,
): boolean {
  const candidateDeath = parseDate(candidate.deathDate);
  const deceasedDeath = parseDate(deceased.deathDate);

  if (candidateDeath === null || deceasedDeath === null) {
    return false;
  }

  return candidateDeath <= deceasedDeath;
}

function getPersonById(graph: FamilyGraph, personId: string): Person | null {
  return graph.persons.find((person) => person.id === personId) ?? null;
}

function getParentIds(graph: FamilyGraph, personId: string): string[] {
  const parentIds = new Set<string>();

  for (const relationship of graph.relationships) {
    if (
      relationship.relationType === "parent" &&
      relationship.toPersonId === personId
    ) {
      parentIds.add(relationship.fromPersonId);
    }

    if (
      relationship.relationType === "child" &&
      relationship.fromPersonId === personId
    ) {
      parentIds.add(relationship.toPersonId);
    }
  }

  return [...parentIds];
}

function getSpouseIds(graph: FamilyGraph, personId: string): string[] {
  const spouseIds = new Set<string>();

  for (const relationship of graph.relationships) {
    if (relationship.relationType !== "spouse") {
      continue;
    }

    if (relationship.fromPersonId === personId) {
      spouseIds.add(relationship.toPersonId);
    }

    if (relationship.toPersonId === personId) {
      spouseIds.add(relationship.fromPersonId);
    }
  }

  spouseIds.delete(personId);
  return [...spouseIds];
}

function detectAdoptionOrComplexParentage(graph: FamilyGraph): string[] {
  const messages = new Set<string>();
  const parentCounts = new Map<string, Set<string>>();

  for (const relationship of graph.relationships) {
    if (relationship.relationType === "parent") {
      const parents = parentCounts.get(relationship.toPersonId) ?? new Set<string>();
      parents.add(relationship.fromPersonId);
      parentCounts.set(relationship.toPersonId, parents);
    }

    if (relationship.relationType === "child") {
      const parents = parentCounts.get(relationship.fromPersonId) ?? new Set<string>();
      parents.add(relationship.toPersonId);
      parentCounts.set(relationship.fromPersonId, parents);
    }
  }

  for (const [childId, parents] of parentCounts.entries()) {
    if (parents.size > 2) {
      messages.add(
        `Person "${childId}" has more than two parents recorded; adoption or complex parentage is unsupported.`,
      );
    }
  }

  return [...messages];
}

function detectRepresentation(graph: FamilyGraph, deceasedId: string): string[] {
  const deceased = getPersonById(graph, deceasedId);
  if (!deceased) {
    return [];
  }

  const messages = new Set<string>();

  for (const child of findChildren(graph, deceasedId)) {
    if (!predeceasedCandidate(child, deceased)) {
      continue;
    }

    if (findChildren(graph, child.id).length > 0) {
      messages.add(
        `Predeceased child "${child.id}" has descendants; representation inheritance is unsupported.`,
      );
    }
  }

  return [...messages];
}

function detectHalfBloodSiblings(
  graph: FamilyGraph,
  deceasedId: string,
): string[] {
  const deceasedParents = new Set(getParentIds(graph, deceasedId));
  if (deceasedParents.size === 0) {
    return [];
  }

  const siblingIds = new Set<string>();

  for (const relationship of graph.relationships) {
    if (relationship.relationType !== "sibling") {
      continue;
    }

    if (relationship.fromPersonId === deceasedId) {
      siblingIds.add(relationship.toPersonId);
    }

    if (relationship.toPersonId === deceasedId) {
      siblingIds.add(relationship.fromPersonId);
    }
  }

  for (const person of graph.persons) {
    if (person.id === deceasedId) {
      continue;
    }

    const parentIds = getParentIds(graph, person.id);
    const sharedParentCount = parentIds.filter((parentId) =>
      deceasedParents.has(parentId),
    ).length;

    if (sharedParentCount > 0) {
      siblingIds.add(person.id);
    }
  }

  const messages = new Set<string>();

  for (const siblingId of siblingIds) {
    const sharedParentCount = getParentIds(graph, siblingId).filter((parentId) =>
      deceasedParents.has(parentId),
    ).length;

    if (sharedParentCount === 1) {
      messages.add(
        `Half-blood sibling "${siblingId}" was detected; sibling inheritance rules are unsupported.`,
      );
    }
  }

  return [...messages];
}

function detectMultipleSpouses(
  graph: FamilyGraph,
  deceasedId: string,
): string[] {
  const spouseIds = getSpouseIds(graph, deceasedId);

  if (spouseIds.length > 1) {
    return [
      `Multiple spouses were linked to "${deceasedId}"; divorce/remarriage history is unsupported.`,
    ];
  }

  return [];
}

function detectUnsupportedHeirClass(
  graph: FamilyGraph,
  deceasedId: string,
): string[] {
  const deceased = getPersonById(graph, deceasedId);
  if (!deceased) {
    return [];
  }

  const hasSpouse = getSpouseIds(graph, deceasedId)
    .map((spouseId) => getPersonById(graph, spouseId))
    .some((spouse): spouse is Person => spouse !== null && !predeceasedCandidate(spouse, deceased));
  const hasChildren = findChildren(graph, deceasedId).some(
    (child) => !predeceasedCandidate(child, deceased),
  );

  if (!hasSpouse && !hasChildren) {
    return [
      `No spouse or children were found for "${deceasedId}"; class2/class3 inheritance is unsupported.`,
    ];
  }

  return [];
}

export function detectUnsupported(
  graph: FamilyGraph,
  deceasedId: string,
): string[] {
  const deceased = getPersonById(graph, deceasedId);
  if (!deceased) {
    return [`Person "${deceasedId}" was not found in the family graph.`];
  }

  return [
    ...detectAdoptionOrComplexParentage(graph),
    ...detectMultipleSpouses(graph, deceasedId),
    ...detectRepresentation(graph, deceasedId),
    ...detectHalfBloodSiblings(graph, deceasedId),
    ...detectUnsupportedHeirClass(graph, deceasedId),
  ];
}
