type DecimalLike = number | string | { toNumber(): number } | { toString(): string };

type CostSummaryDocumentRow = {
  id: string;
  tokensUsed: number | null;
  estimatedCostUsd: DecimalLike | null;
};

type CostSummaryDocumentDelegate = {
  findMany(args: {
    where: { caseId: string };
    select: {
      id: true;
      tokensUsed: true;
      estimatedCostUsd: true;
    };
    orderBy: { createdAt: "asc" };
  }): Promise<CostSummaryDocumentRow[]>;
};

export type CostSummaryPrisma = {
  document: CostSummaryDocumentDelegate;
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
  prisma,
  caseId,
}: {
  prisma: CostSummaryPrisma;
  caseId: string;
}): Promise<CaseCostSummary> {
  const documents = await prisma.document.findMany({
    where: {
      caseId,
    },
    select: {
      id: true,
      tokensUsed: true,
      estimatedCostUsd: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

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
