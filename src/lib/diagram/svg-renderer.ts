import type { DiagramEdge, DiagramLayout, DiagramNode, DiagramPerson } from "./types";

const PAGE_WIDTH = 2100;
const PAGE_HEIGHT = 2970;
const PAGE_MARGIN = 120;
const TITLE_SPACE = 180;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function buildPersonLines(person: DiagramPerson): string[] {
  if (person.role === "deceased") {
    return [
      person.name,
      `本籍: ${person.domicile ?? "未記載"}`,
      `最後の住所: ${person.lastAddress ?? "未記載"}`,
      `死亡日: ${person.deathDate ?? "未記載"}`
    ];
  }

  return [
    person.name,
    `住所: ${person.address ?? person.lastAddress ?? "未記載"}`,
    `生年月日: ${person.birthDate ?? "未記載"}`,
    `続柄: ${getRelationshipLabel(person)}`
  ];
}

function buildNodeMarkup(node: DiagramNode): string {
  const lines = buildPersonLines(node.data);
  const strokeWidth = node.data.role === "deceased" ? 3 : 1.5;
  const fill = node.data.isDeceased ? "#e5e7eb" : "#ffffff";
  const titleColor = node.data.role === "deceased" ? "#111827" : "#1f2937";

  const text = lines
    .map((line, index) => {
      const y = index === 0 ? 34 : 64 + (index - 1) * 24;
      const size = index === 0 ? 22 : 16;
      const weight = index === 0 ? 700 : 400;

      return `<text x="18" y="${y}" font-size="${size}" font-weight="${weight}" fill="${
        index === 0 ? titleColor : "#374151"
      }">${escapeXml(line)}</text>`;
    })
    .join("");

  return [
    `<g transform="translate(${node.x} ${node.y})">`,
    `<rect width="${node.width}" height="${node.height}" rx="12" ry="12" fill="${fill}" stroke="#111827" stroke-width="${strokeWidth}" />`,
    text,
    "</g>"
  ].join("");
}

function buildMarriageMarkup(source: DiagramNode, target: DiagramNode): string {
  const sourceX = source.x + source.width / 2;
  const sourceY = source.y + source.height / 2;
  const targetX = target.x + target.width / 2;
  const targetY = target.y + target.height / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const offsetX = (-dy / length) * 3;
  const offsetY = (dx / length) * 3;

  return [
    `<line x1="${sourceX + offsetX}" y1="${sourceY + offsetY}" x2="${
      targetX + offsetX
    }" y2="${targetY + offsetY}" stroke="#111827" stroke-width="1.5" />`,
    `<line x1="${sourceX - offsetX}" y1="${sourceY - offsetY}" x2="${
      targetX - offsetX
    }" y2="${targetY - offsetY}" stroke="#111827" stroke-width="1.5" />`
  ].join("");
}

function buildParentChildMarkup(source: DiagramNode, target: DiagramNode): string {
  const sourceX = source.x + source.width / 2;
  const sourceY = source.y + source.height;
  const targetX = target.x + target.width / 2;
  const targetY = target.y;
  const midY = (sourceY + targetY) / 2;
  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${sourceX} ${midY}`,
    `L ${targetX} ${midY}`,
    `L ${targetX} ${targetY}`
  ].join(" ");

  return `<path d="${path}" fill="none" stroke="#111827" stroke-width="1.5" />`;
}

function buildEdgeMarkup(edge: DiagramEdge, nodeMap: Map<string, DiagramNode>): string {
  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);

  if (!source || !target) {
    return "";
  }

  if (edge.type === "marriage") {
    return buildMarriageMarkup(source, target);
  }

  return buildParentChildMarkup(source, target);
}

function computeTransform(layout: DiagramLayout): {
  scale: number;
  translateX: number;
  translateY: number;
} {
  const maxX = Math.max(...layout.nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...layout.nodes.map((node) => node.y + node.height));
  const minX = Math.min(...layout.nodes.map((node) => node.x));
  const minY = Math.min(...layout.nodes.map((node) => node.y));
  const contentWidth = Math.max(maxX - minX, 1);
  const contentHeight = Math.max(maxY - minY, 1);
  const availableWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const availableHeight = PAGE_HEIGHT - PAGE_MARGIN * 2 - TITLE_SPACE;
  const scale = Math.min(
    availableWidth / contentWidth,
    availableHeight / contentHeight,
    3
  );
  const translateX =
    PAGE_MARGIN + (availableWidth - contentWidth * scale) / 2 - minX * scale;
  const translateY =
    PAGE_MARGIN +
    TITLE_SPACE +
    (availableHeight - contentHeight * scale) / 2 -
    minY * scale;

  return { scale, translateX, translateY };
}

export function renderToSvg(layout: DiagramLayout, title?: string): string {
  if (layout.nodes.length === 0) {
    throw new Error("renderToSvg requires at least one node");
  }

  const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]));
  const { scale, translateX, translateY } = computeTransform(layout);
  const edgeMarkup = layout.edges
    .map((edge) => buildEdgeMarkup(edge, nodeMap))
    .join("");
  const nodeMarkup = layout.nodes.map((node) => buildNodeMarkup(node)).join("");
  const escapedTitle = escapeXml(title ?? "相続関係図");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" role="img" aria-label="${escapedTitle}">`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="#f9fafb" />`,
    `<text x="${PAGE_MARGIN}" y="${PAGE_MARGIN}" font-family="'Noto Sans JP', system-ui, sans-serif" font-size="36" font-weight="700" fill="#111827">${escapedTitle}</text>`,
    `<line x1="${PAGE_MARGIN}" y1="${PAGE_MARGIN + 28}" x2="${
      PAGE_WIDTH - PAGE_MARGIN
    }" y2="${PAGE_MARGIN + 28}" stroke="#d1d5db" stroke-width="2" />`,
    `<g font-family="'Noto Sans JP', system-ui, sans-serif" transform="translate(${translateX} ${translateY}) scale(${scale})">`,
    edgeMarkup,
    nodeMarkup,
    "</g>",
    "</svg>"
  ].join("");
}
