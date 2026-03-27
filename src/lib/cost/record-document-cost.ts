type RecordDocumentCostInput = {
  documentId: string;
  tokensUsed: number;
  estimatedCostUsd: number;
};

type RecordDocumentCostDocument = {
  update(args: {
    where: { id: string };
    data: {
      tokensUsed: number;
      estimatedCostUsd: number;
    };
    select: {
      id: true;
      tokensUsed: true;
      estimatedCostUsd: true;
    };
  }): Promise<{
    id: string;
    tokensUsed: number | null;
    estimatedCostUsd: number | string | { toNumber(): number } | null;
  }>;
};

export type RecordDocumentCostPrisma = {
  document: RecordDocumentCostDocument;
};

export async function recordDocumentCost(
  prisma: RecordDocumentCostPrisma,
  input: RecordDocumentCostInput,
) {
  return prisma.document.update({
    where: {
      id: input.documentId,
    },
    data: {
      tokensUsed: input.tokensUsed,
      estimatedCostUsd: input.estimatedCostUsd,
    },
    select: {
      id: true,
      tokensUsed: true,
      estimatedCostUsd: true,
    },
  });
}
