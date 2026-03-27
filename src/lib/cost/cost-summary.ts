import { query } from "@/lib/db/client";

type DecimalLike = number | string | { toNumber(): number } | { toString(): string };

type CostSummaryDocumentRow = {
  id: string;
  tokensUsed: number | null;
  estimatedCostUsd: DecimalLike | null;
};

export type CostSummaryDb = {
  listDocumentsByCaseId(caseId: string): Promise<CostSummaryDocumentRow[]>;
};

export type CaseCostSummary = {
  caseId: string;
  totalTokens: number;
  totalCostUsd: number;
  documents: Array<{
    id: string;
    tokensUsed: number;
    estimatedCostUsd: number;
  }>;
};

const defaultCostSummaryDb: CostSummaryDb = {
  async listDocumentsByCaseId(caseId) {
    const result = await query<CostSummaryDocumentRow>(
      `
        SELECT
          id,
          tokens_used AS "tokensUsed",
          estimated_cost_usd AS "estimatedCostUsd"
        FROM documents
        WHERE case_id = $1
        ORDER BY created_at ASC
      `,
      [caseId],
    );

    return result.rows;
  },
};

function roundUsd(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function toNumber(value: DecimalLike | null) {
  if (value === null) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if ("toNumber" in value) {
    return value.toNumber();
  }

  return Number(value.toString());
}

export async function getCaseCostSummary({
  caseId,
  db = defaultCostSummaryDb,
}: {
  caseId: string;
  db?: CostSummaryDb;
}): Promise<CaseCostSummary> {
  const documents = await db.listDocumentsByCaseId(caseId);

  const normalizedDocuments = documents.map((document) => ({
    id: document.id,
    tokensUsed: document.tokensUsed ?? 0,
    estimatedCostUsd: roundUsd(toNumber(document.estimatedCostUsd)),
  }));

  return {
    caseId,
    totalTokens: normalizedDocuments.reduce(
      (sum, document) => sum + document.tokensUsed,
      0,
    ),
    totalCostUsd: roundUsd(
      normalizedDocuments.reduce(
        (sum, document) => sum + document.estimatedCostUsd,
        0,
      ),
    ),
    documents: normalizedDocuments,
  };
}
