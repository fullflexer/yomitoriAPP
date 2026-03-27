import { query } from "@/lib/db/client";

type RecordDocumentCostInput = {
  documentId: string;
  tokensUsed: number;
  estimatedCostUsd: number;
};

type RecordDocumentCostRow = {
  id: string;
  tokensUsed: number | null;
  estimatedCostUsd: number | string | { toNumber(): number } | null;
};

export type RecordDocumentCostDb = {
  updateDocumentCost(input: RecordDocumentCostInput): Promise<RecordDocumentCostRow>;
};

const defaultRecordDocumentCostDb: RecordDocumentCostDb = {
  async updateDocumentCost(input) {
    const result = await query<RecordDocumentCostRow>(
      `
        UPDATE documents
        SET
          tokens_used = $2,
          estimated_cost_usd = $3
        WHERE id = $1
        RETURNING
          id,
          tokens_used AS "tokensUsed",
          estimated_cost_usd AS "estimatedCostUsd"
      `,
      [input.documentId, input.tokensUsed, input.estimatedCostUsd],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Document not found: ${input.documentId}`);
    }

    return row;
  },
};

export async function recordDocumentCost(
  input: RecordDocumentCostInput,
  db: RecordDocumentCostDb = defaultRecordDocumentCostDb,
) {
  return db.updateDocumentCost(input);
}
