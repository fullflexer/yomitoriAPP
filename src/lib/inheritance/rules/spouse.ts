import type { FamilyGraph, Person, Relationship } from "../types";

function isSpouseRelationship(
  relationship: Relationship,
  deceasedId: string,
): boolean {
  return (
    relationship.relationType === "spouse" &&
    (relationship.fromPersonId === deceasedId ||
      relationship.toPersonId === deceasedId)
  );
}

export function findSpouse(
  graph: FamilyGraph,
  deceasedId: string,
): Person | null {
  const spouseIds = new Set<string>();

  for (const relationship of graph.relationships) {
    if (!isSpouseRelationship(relationship, deceasedId)) {
      continue;
    }

    const spouseId =
      relationship.fromPersonId === deceasedId
        ? relationship.toPersonId
        : relationship.fromPersonId;

    if (spouseId !== deceasedId) {
      spouseIds.add(spouseId);
    }
  }

  for (const person of graph.persons) {
    if (spouseIds.has(person.id)) {
      return person;
    }
  }

  return null;
}
