import { getCaseDetail } from "@/app/(dashboard)/_lib/cases";
import { buildCaseDiagramPdf } from "@/app/(dashboard)/_lib/diagram";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const caseRecord = await getCaseDetail(id);

  if (!caseRecord || caseRecord.persons.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const { pdf } = await buildCaseDiagramPdf(caseRecord);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="yomitori-case-${id}-diagram.pdf"`
    }
  });
}
