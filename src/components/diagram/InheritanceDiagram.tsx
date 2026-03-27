"use client";

import type { CSSProperties, ReactElement, ReactNode } from "react";

import {
  Background,
  BaseEdge,
  Controls,
  Position,
  ReactFlow,
  getStraightPath,
  type Edge,
  type EdgeProps,
  type Node
} from "reactflow";

import type {
  DiagramLayout,
  DiagramNode,
  DiagramPerson
} from "../../lib/diagram/types";

interface InheritanceDiagramProps {
  layout: DiagramLayout;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

interface DiagramNodeData {
  person: DiagramPerson;
  label: ReactNode;
}

function getRelationshipLabel(person: DiagramPerson): string {
  if (person.relationshipLabel) {
    return person.relationshipLabel;
  }

  switch (person.role) {
    case "deceased":
      return "被相続人";
    case "spouse":
      return "配偶者";
    case "heir":
      return "相続人";
    default:
      return "関係者";
  }
}

function buildLabel(node: DiagramNode): ReactNode {
  const person = node.data;
  const lines =
    person.role === "deceased"
      ? [
          person.name,
          `本籍: ${person.domicile ?? "未記載"}`,
          `最後の住所: ${person.lastAddress ?? "未記載"}`,
          `死亡日: ${person.deathDate ?? "未記載"}`
        ]
      : [
          person.name,
          `住所: ${person.address ?? person.lastAddress ?? "未記載"}`,
          `生年月日: ${person.birthDate ?? "未記載"}`,
          `続柄: ${getRelationshipLabel(person)}`
        ];

  return (
    <div style={{ fontSize: 12, lineHeight: 1.45 }}>
      {lines.map((line, index) => (
        <div
          key={`${node.id}:${index}`}
          style={{
            fontWeight: index === 0 ? 700 : 400,
            marginBottom: index === 0 ? 6 : 2
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function MarriageEdge(props: EdgeProps): ReactElement {
  const dx = props.targetX - props.sourceX;
  const dy = props.targetY - props.sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const offsetX = (-dy / length) * 2.5;
  const offsetY = (dx / length) * 2.5;
  const [firstPath] = getStraightPath({
    sourceX: props.sourceX + offsetX,
    sourceY: props.sourceY + offsetY,
    targetX: props.targetX + offsetX,
    targetY: props.targetY + offsetY
  });
  const [secondPath] = getStraightPath({
    sourceX: props.sourceX - offsetX,
    sourceY: props.sourceY - offsetY,
    targetX: props.targetX - offsetX,
    targetY: props.targetY - offsetY
  });

  return (
    <>
      <BaseEdge path={firstPath} style={{ stroke: "#111827", strokeWidth: 1.5 }} />
      <BaseEdge path={secondPath} style={{ stroke: "#111827", strokeWidth: 1.5 }} />
    </>
  );
}

const edgeTypes = {
  marriage: MarriageEdge
};

function toFlowNode(node: DiagramNode): Node<DiagramNodeData> {
  const isDeceased = node.data.isDeceased;

  return {
    id: node.id,
    position: { x: node.x, y: node.y },
    data: {
      person: node.data,
      label: buildLabel(node)
    },
    draggable: false,
    selectable: false,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: {
      width: node.width,
      height: node.height,
      borderRadius: 12,
      border: `${node.data.role === "deceased" ? 3 : 1.5}px solid #111827`,
      background: isDeceased ? "#e5e7eb" : "#ffffff",
      color: "#111827",
      padding: 14,
      boxSizing: "border-box"
    }
  };
}

function toFlowEdge(layoutEdge: DiagramLayout["edges"][number]): Edge {
  return {
    id: layoutEdge.id,
    source: layoutEdge.source,
    target: layoutEdge.target,
    type: layoutEdge.type === "marriage" ? "marriage" : "straight",
    animated: false,
    style: {
      stroke: "#111827",
      strokeWidth: 1.5
    }
  };
}

export function InheritanceDiagram({
  layout,
  title,
  className,
  style
}: InheritanceDiagramProps): ReactElement {
  const nodes = layout.nodes.map(toFlowNode);
  const edges = layout.edges.map(toFlowEdge);

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: 720, ...style }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d1d5db" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {title ? (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            fontSize: 18,
            fontWeight: 700,
            pointerEvents: "none"
          }}
        >
          {title}
        </div>
      ) : null}
    </div>
  );
}
