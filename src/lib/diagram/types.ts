export type DiagramPersonRole = "deceased" | "spouse" | "heir" | "other";

export type DiagramRelationshipType = "marriage" | "parent-child";

export interface DiagramPerson {
  id: string;
  name: string;
  birthDate?: string;
  deathDate?: string;
  isDeceased: boolean;
  role: DiagramPersonRole;
  domicile?: string;
  lastAddress?: string;
  registeredAddress?: string;
  address?: string;
  relationshipLabel?: string;
  notes?: string[];
}

export interface DiagramRelationship {
  from: string;
  to: string;
  type: DiagramRelationshipType;
}

export interface DiagramInput {
  persons: DiagramPerson[];
  relationships: DiagramRelationship[];
  title?: string;
}

export interface DiagramNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: DiagramPerson;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  type: DiagramRelationshipType;
}

export interface DiagramLayout {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
