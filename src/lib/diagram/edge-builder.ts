import type { ElkExtendedEdge } from "elkjs/lib/elk-api";

import type { DiagramRelationship } from "./types";

export function buildEdges(
  relationships: DiagramRelationship[]
): ElkExtendedEdge[] {
  return relationships.map((relationship, index) => ({
    id: `${relationship.type}:${relationship.from}:${relationship.to}:${index}`,
    sources: [relationship.from],
    targets: [relationship.to],
    layoutOptions: {
      "diagram.strokeVariant":
        relationship.type === "marriage" ? "double" : "single"
    }
  }));
}
