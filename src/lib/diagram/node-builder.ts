import type { ElkNode } from "elkjs/lib/elk-api";

import type { DiagramPerson } from "./types";

const DEFAULT_NODE_WIDTH = 240;
const DEFAULT_NODE_HEIGHT = 112;
const DECEASED_NODE_HEIGHT = 132;

export function getNodeDimensions(person: DiagramPerson): {
  width: number;
  height: number;
} {
  return {
    width: DEFAULT_NODE_WIDTH,
    height: person.role === "deceased" ? DECEASED_NODE_HEIGHT : DEFAULT_NODE_HEIGHT
  };
}

export function buildNodes(persons: DiagramPerson[]): ElkNode[] {
  return persons.map((person) => {
    const { width, height } = getNodeDimensions(person);
    const strokeWidth = person.role === "deceased" ? "3" : "1.5";
    const fill = person.isDeceased ? "#e5e7eb" : "#ffffff";

    return {
      id: person.id,
      width,
      height,
      labels: [{ text: person.name }],
      layoutOptions: {
        "nodeLabels.placement": "[H_CENTER, V_TOP, INSIDE]",
        "diagram.strokeWidth": strokeWidth,
        "diagram.fill": fill
      }
    };
  });
}
