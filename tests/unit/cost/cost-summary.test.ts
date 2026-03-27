import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCaseCostSummary,
  type CostSummaryDb,
} from "../../../src/lib/cost/cost-summary";
import {
  recordDocumentCost,
  type RecordDocumentCostDb,
} from "../../../src/lib/cost/record-document-cost";

type StoredDocument = {
  id: string;
  caseId: string;
  tokensUsed: number | null;
  estimatedCostUsd: number | null;
  createdAt: Date;
};

function createCostDb(seed: StoredDocument[]) {
  const state = {
    documents: [...seed],
  };

  const db: RecordDocumentCostDb & CostSummaryDb = {
    async updateDocumentCost(input) {
      const index = state.documents.findIndex(
        (document) => document.id === input.documentId,
      );

      if (index === -1) {
        throw new Error(`Document not found: ${input.documentId}`);
      }

      const nextDocument = {
        ...state.documents[index],
        tokensUsed: input.tokensUsed,
        estimatedCostUsd: input.estimatedCostUsd,
      };

      state.documents[index] = nextDocument;

      return {
        id: nextDocument.id,
        tokensUsed: nextDocument.tokensUsed,
        estimatedCostUsd: nextDocument.estimatedCostUsd,
      };
    },
    async listDocumentsByCaseId(caseId) {
      return state.documents
        .filter((document) => document.caseId === caseId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((document) => ({
          id: document.id,
          tokensUsed: document.tokensUsed,
          estimatedCostUsd: document.estimatedCostUsd,
        }));
    },
  };

  return { db, state };
}

describe("document cost persistence", () => {
  it("documents.tokens_used と estimated_cost_usd を保存する", async () => {
    const { db, state } = createCostDb([
      {
        id: "doc-1",
        caseId: "case-1",
        tokensUsed: null,
        estimatedCostUsd: null,
        createdAt: new Date("2026-03-27T10:00:00.000Z"),
      },
    ]);

    const saved = await recordDocumentCost(
      {
        documentId: "doc-1",
        tokensUsed: 2048,
        estimatedCostUsd: 0.1234,
      },
      db,
    );

    expect(saved).toEqual({
      id: "doc-1",
      tokensUsed: 2048,
      estimatedCostUsd: 0.1234,
    });
    expect(state.documents[0]).toMatchObject({
      tokensUsed: 2048,
      estimatedCostUsd: 0.1234,
    });
  });
});

describe("case cost summary", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("案件内 documents の tokens/cost を正しく集計する", async () => {
    const { db } = createCostDb([
      {
        id: "doc-1",
        caseId: "case-1",
        tokensUsed: 1500,
        estimatedCostUsd: 0.1111,
        createdAt: new Date("2026-03-27T10:00:00.000Z"),
      },
      {
        id: "doc-2",
        caseId: "case-1",
        tokensUsed: 2500,
        estimatedCostUsd: 0.2222,
        createdAt: new Date("2026-03-27T11:00:00.000Z"),
      },
      {
        id: "doc-3",
        caseId: "case-2",
        tokensUsed: 999,
        estimatedCostUsd: 0.9999,
        createdAt: new Date("2026-03-27T09:00:00.000Z"),
      },
    ]);

    const summary = await getCaseCostSummary({
      caseId: "case-1",
      db,
    });

    expect(summary).toEqual({
      caseId: "case-1",
      totalTokens: 4000,
      totalCostUsd: 0.3333,
      documents: [
        {
          id: "doc-1",
          tokensUsed: 1500,
          estimatedCostUsd: 0.1111,
        },
        {
          id: "doc-2",
          tokensUsed: 2500,
          estimatedCostUsd: 0.2222,
        },
      ],
    });
  });

  it("GET /api/cases/[id]/cost-summary が集計 JSON を返す", async () => {
    const getCaseCostSummaryMock = vi.fn().mockResolvedValue({
      caseId: "case-1",
      totalTokens: 4000,
      totalCostUsd: 0.3333,
      documents: [
        {
          id: "doc-1",
          tokensUsed: 1500,
          estimatedCostUsd: 0.1111,
        },
        {
          id: "doc-2",
          tokensUsed: 2500,
          estimatedCostUsd: 0.2222,
        },
      ],
    });

    vi.doMock("../../../src/lib/cost/cost-summary", () => ({
      getCaseCostSummary: getCaseCostSummaryMock,
    }));

    const { GET } = await import(
      "../../../src/app/api/cases/[id]/cost-summary/route"
    );
    const response = await GET(
      new Request("http://localhost/api/cases/case-1/cost-summary"),
      {
        params: Promise.resolve({
          id: "case-1",
        }),
      },
    );

    expect(getCaseCostSummaryMock).toHaveBeenCalledWith({
      caseId: "case-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      caseId: "case-1",
      totalTokens: 4000,
      totalCostUsd: 0.3333,
      documents: [
        {
          id: "doc-1",
          tokensUsed: 1500,
          estimatedCostUsd: 0.1111,
        },
        {
          id: "doc-2",
          tokensUsed: 2500,
          estimatedCostUsd: 0.2222,
        },
      ],
    });
  });
});
