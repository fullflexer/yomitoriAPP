import { NextResponse } from "next/server";

import { getCaseCostSummary } from "../../../../../lib/cost/cost-summary";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const summary = await getCaseCostSummary({ caseId: id });

  return NextResponse.json(summary);
}
