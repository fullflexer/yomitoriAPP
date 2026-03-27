import type { FamilyGraph, Person, Relationship } from "../types";

function isParentToChild(
  relationship: Relationship,
  parentId: string,
): boolean {
  return (
    (relationship.relationType === "parent" &&
      relationship.fromPersonId === parentId) ||
    (relationship.relationType === "child" &&
      relationship.toPersonId === parentId)
  );
}

function getChildId(relationship: Relationship): string {
  return relationship.relationType === "parent"
    ? relationship.toPersonId
    : relationship.fromPersonId;
}

export function findChildren(
  graph: FamilyGraph,
  deceasedId: string,
): Person[] {
  const childIds = new Set<string>();

  for (const relationship of graph.relationships) {
    if (!isParentToChild(relationship, deceasedId)) {
      continue;
    }

    const childId = getChildId(relationship);
    if (childId !== deceasedId) {
      childIds.add(childId);
    }
  }

  return graph.persons.filter((person) => childIds.has(person.id));
}
