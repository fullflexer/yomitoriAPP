import { calculateLayout } from "@/lib/diagram/layout-engine";
import { renderToPdf } from "@/lib/diagram/pdf-renderer";
import { renderToSvg } from "@/lib/diagram/svg-renderer";

import type { CaseDetailItem } from "./cases";
import { buildDiagramInput } from "./cases";

export async function buildCaseDiagramLayout(caseRecord: CaseDetailItem) {
  return calculateLayout(buildDiagramInput(caseRecord));
}

export async function buildCaseDiagramPdf(caseRecord: CaseDetailItem) {
  const input = buildDiagramInput(caseRecord);
  const layout = await calculateLayout(input);
  const svg = renderToSvg(layout, `${caseRecord.title} 相続関係図`);

  return {
    layout,
    svg,
    pdf: await renderToPdf(svg)
  };
}
