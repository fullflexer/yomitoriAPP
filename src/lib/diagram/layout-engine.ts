import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

import { buildEdges } from "./edge-builder";
import { buildNodes } from "./node-builder";
import type {
  DiagramEdge,
  DiagramInput,
  DiagramLayout,
  DiagramNode,
  DiagramRelationship
} from "./types";

interface FamilyNode {
  id: string;
  spouses: [string, string];
}

const elk = new ELK();
const FAMILY_NODE_SIZE = 24;
const SPOUSE_GAP = 36;

function buildFamilyId(left: string, right: string): string {
  const [first, second] = [left, right].sort();

  return `family:${first}:${second}`;
}

function collectFamilies(relationships: DiagramRelationship[]): FamilyNode[] {
  const familyMap = new Map<string, FamilyNode>();

  for (const relationship of relationships) {
    if (relationship.type !== "marriage") {
      continue;
    }

    const id = buildFamilyId(relationship.from, relationship.to);
    if (!familyMap.has(id)) {
      const spouses = [relationship.from, relationship.to].sort() as [
        string,
        string
      ];

      familyMap.set(id, { id, spouses });
    }
  }

  return Array.from(familyMap.values());
}

function mapFamiliesByPerson(families: FamilyNode[]): Map<string, FamilyNode[]> {
  const result = new Map<string, FamilyNode[]>();

  for (const family of families) {
    for (const spouse of family.spouses) {
      const current = result.get(spouse) ?? [];
      current.push(family);
      result.set(spouse, current);
    }
  }

  return result;
}

function findFamilyForParents(
  parentIds: string[],
  familiesByPerson: Map<string, FamilyNode[]>
): FamilyNode | undefined {
  const uniqueParentIds = Array.from(new Set(parentIds));

  for (const parentId of uniqueParentIds) {
    const candidates = familiesByPerson.get(parentId) ?? [];
    const exact = candidates.find((candidate) =>
      uniqueParentIds.every((currentParentId) =>
        candidate.spouses.includes(currentParentId)
      )
    );

    if (exact) {
      return exact;
    }
  }

  if (uniqueParentIds.length === 1) {
    const [parentId] = uniqueParentIds;
    const candidates = familiesByPerson.get(parentId) ?? [];

    if (candidates.length === 1) {
      return candidates[0];
    }
  }

  return undefined;
}

function buildInternalGraph(
  input: DiagramInput
): { children: ElkNode[]; edges: ElkExtendedEdge[]; families: FamilyNode[] } {
  const personNodes = buildNodes(input.persons);
  const publicEdges = buildEdges(input.relationships);
  const families = collectFamilies(input.relationships);
  const familiesByPerson = mapFamiliesByPerson(families);

  const familyNodes: ElkNode[] = families.map((family) => ({
    id: family.id,
    width: FAMILY_NODE_SIZE,
    height: FAMILY_NODE_SIZE,
    layoutOptions: {
      "diagram.virtual": "true"
    }
  }));

  const internalEdges: ElkExtendedEdge[] = [];
  const familyChildPairs = new Set<string>();
  const parentsByChild = new Map<string, string[]>();

  for (const edge of publicEdges) {
    if (edge.id.startsWith("marriage:")) {
      const [source] = edge.sources ?? [];
      if (!source) {
        continue;
      }

      const target = edge.targets?.[0];
      if (!target) {
        continue;
      }

      const familyId = buildFamilyId(source, target);
      internalEdges.push({
        id: `${edge.id}:source-family`,
        sources: [source],
        targets: [familyId]
      });
      internalEdges.push({
        id: `${edge.id}:target-family`,
        sources: [target],
        targets: [familyId]
      });
      continue;
    }

    const childId = edge.targets?.[0];
    const parentId = edge.sources?.[0];

    if (!childId || !parentId) {
      continue;
    }

    const currentParents = parentsByChild.get(childId) ?? [];
    currentParents.push(parentId);
    parentsByChild.set(childId, currentParents);
  }

  for (const [childId, parentIds] of parentsByChild.entries()) {
    const family = findFamilyForParents(parentIds, familiesByPerson);
    if (family) {
      const key = `${family.id}:${childId}`;
      if (!familyChildPairs.has(key)) {
        internalEdges.push({
          id: `family-child:${family.id}:${childId}`,
          sources: [family.id],
          targets: [childId]
        });
        familyChildPairs.add(key);
      }

      continue;
    }

    for (const parentId of parentIds) {
      internalEdges.push({
        id: `parent-child:${parentId}:${childId}`,
        sources: [parentId],
        targets: [childId]
      });
    }
  }

  return {
    children: [...personNodes, ...familyNodes],
    edges: internalEdges,
    families
  };
}

function toDiagramEdges(relationships: DiagramRelationship[]): DiagramEdge[] {
  return relationships.map((relationship, index) => ({
    id: `${relationship.type}:${relationship.from}:${relationship.to}:${index}`,
    source: relationship.from,
    target: relationship.to,
    type: relationship.type
  }));
}

function alignSpouses(nodes: DiagramNode[], families: FamilyNode[]): DiagramNode[] {
  const positioned = new Map(nodes.map((node) => [node.id, { ...node }]));

  for (const family of families) {
    const [leftId, rightId] = family.spouses;
    const first = positioned.get(leftId);
    const second = positioned.get(rightId);

    if (!first || !second) {
      continue;
    }

    const [leftNode, rightNode] =
      first.x <= second.x ? [first, second] : [second, first];
    const centerX =
      (leftNode.x + leftNode.width / 2 + rightNode.x + rightNode.width / 2) / 2;
    const totalWidth = leftNode.width + rightNode.width + SPOUSE_GAP;

    leftNode.x = centerX - totalWidth / 2;
    rightNode.x = leftNode.x + leftNode.width + SPOUSE_GAP;

    const sharedY = Math.min(leftNode.y, rightNode.y);
    leftNode.y = sharedY;
    rightNode.y = sharedY;
  }

  return Array.from(positioned.values());
}

function normalizePositions(nodes: DiagramNode[]): DiagramNode[] {
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const shiftX = minX < 0 ? Math.abs(minX) + 24 : 0;
  const shiftY = minY < 0 ? Math.abs(minY) + 24 : 0;

  return nodes.map((node) => ({
    ...node,
    x: node.x + shiftX,
    y: node.y + shiftY
  }));
}

export async function calculateLayout(
  input: DiagramInput
): Promise<DiagramLayout> {
  const personMap = new Map(input.persons.map((person) => [person.id, person]));
  const { children, edges, families } = buildInternalGraph(input);

  const graph: ElkNode = {
    id: "inheritance-diagram",
    children,
    edges,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]"
    }
  };

  const laidOutGraph = await elk.layout(graph);
  const diagramNodes: DiagramNode[] = [];

  for (const child of laidOutGraph.children ?? []) {
    const person = personMap.get(child.id);
    if (!person) {
      continue;
    }

    if (typeof child.x !== "number" || typeof child.y !== "number") {
      throw new Error(`ELK did not return coordinates for node ${child.id}`);
    }

    diagramNodes.push({
      id: child.id,
      x: child.x,
      y: child.y,
      width: child.width ?? 0,
      height: child.height ?? 0,
      data: person
    });
  }

  const alignedNodes = normalizePositions(alignSpouses(diagramNodes, families));

  return {
    nodes: alignedNodes,
    edges: toDiagramEdges(input.relationships)
  };
}
