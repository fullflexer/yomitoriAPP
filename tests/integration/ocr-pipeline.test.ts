import { afterEach, describe, expect, it } from "vitest";

import {
  createOcrPipelineRunner,
  type OcrPipelineDb,
  type OcrPipelineTransactionDb,
} from "../../src/lib/ocr/pipeline";
import { MockOcrProvider } from "../../src/lib/ocr/providers/mock";
import type { OcrResult } from "../../src/lib/ocr/types";
import { parseKosekiOcrResult } from "../../src/lib/parser/koseki-parser";

type StoredDocument = {
  id: string;
  caseId: string;
  r2Key: string;
  originalFilename: string;
  documentType: string;
  status: string;
  statusHistory: string[];
  ocrResult: unknown;
  requiresReview: boolean;
  reviewReason: string[];
  ocrConfidence: number;
  tokensUsed: number | null;
  estimatedCostUsd: number | null;
};

type StoredPerson = {
  id: string;
  caseId: string;
  sourceDocumentId: string;
  fullName: string;
  fullNameKana: string | null;
  birthDate: string | null;
  deathDate: string | null;
  gender: string | null;
  address: string | null;
};

type StoredPersonEvent = {
  personId: string;
  documentId: string;
  eventType: string;
  eventDate: string | null;
  eventDateRaw: string | null;
  counterpartPersonId: string | null;
  rawText: string | null;
  confidence: number | null;
};

function updateStoredDocument(
  documents: StoredDocument[],
  documentId: string,
  data: {
    status?: string;
    ocrResult?: unknown;
    requiresReview?: boolean;
    reviewReason?: string[];
    ocrConfidence?: number;
    tokensUsed?: number;
    estimatedCostUsd?: number;
  },
) {
  const document = documents.find((entry) => entry.id === documentId);

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (data.status) {
    document.status = data.status;
    document.statusHistory.push(data.status);
  }

  if (data.ocrResult !== undefined) {
    document.ocrResult = data.ocrResult;
  }

  if (data.requiresReview !== undefined) {
    document.requiresReview = data.requiresReview;
  }

  if (data.reviewReason !== undefined) {
    document.reviewReason = [...data.reviewReason];
  }

  if (data.ocrConfidence !== undefined) {
    document.ocrConfidence = data.ocrConfidence;
  }

  if (data.tokensUsed !== undefined) {
    document.tokensUsed = data.tokensUsed;
  }

  if (data.estimatedCostUsd !== undefined) {
    document.estimatedCostUsd = data.estimatedCostUsd;
  }
}

function createPipelineDb(seed: { documents: StoredDocument[] }) {
  const state = {
    documents: seed.documents.map((document) => ({
      ...document,
      statusHistory: [...document.statusHistory],
      reviewReason: [...document.reviewReason],
    })),
    persons: [] as StoredPerson[],
    personEvents: [] as StoredPersonEvent[],
    personSequence: 0,
  };

  const createTransactionDb = (): OcrPipelineTransactionDb => ({
    async updateDocument(documentId, data) {
      updateStoredDocument(state.documents, documentId, data);
    },
    async deletePersonsBySourceDocumentId(documentId) {
      const initialLength = state.persons.length;
      state.persons = state.persons.filter(
        (person) => person.sourceDocumentId !== documentId,
      );

      return initialLength - state.persons.length;
    },
    async deletePersonEventsByDocumentId(documentId) {
      const initialLength = state.personEvents.length;
      state.personEvents = state.personEvents.filter(
        (event) => event.documentId !== documentId,
      );

      return initialLength - state.personEvents.length;
    },
    async insertPerson(data) {
      state.personSequence += 1;
      const person: StoredPerson = {
        id: `person-${state.personSequence}`,
        caseId: data.caseId,
        sourceDocumentId: data.sourceDocumentId,
        fullName: data.fullName,
        fullNameKana: data.fullNameKana,
        birthDate: data.birthDate,
        deathDate: data.deathDate,
        gender: data.gender,
        address: data.address,
      };

      state.persons.push(person);

      return {
        id: person.id,
      };
    },
    async insertPersonEvents(data) {
      state.personEvents.push(...data);
      return data.length;
    },
  });

  const db: OcrPipelineDb = {
    async getDocumentOrThrow(documentId) {
      const document = state.documents.find((entry) => entry.id === documentId);

      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      return {
        id: document.id,
        caseId: document.caseId,
        r2Key: document.r2Key,
        originalFilename: document.originalFilename,
        documentType: document.documentType,
        status: document.status,
      };
    },
    async updateDocument(documentId, data) {
      updateStoredDocument(state.documents, documentId, data);
    },
    async runInTransaction(callback) {
      return callback(createTransactionDb());
    },
  };

  return { db, state };
}

describe("runOcrPipeline", () => {
  const originalCostRate = process.env.OCR_COST_PER_1K_TOKENS_USD;

  afterEach(() => {
    if (originalCostRate === undefined) {
      delete process.env.OCR_COST_PER_1K_TOKENS_USD;
      return;
    }

    process.env.OCR_COST_PER_1K_TOKENS_USD = originalCostRate;
  });

  it("OCR結果を JSONB 相当で保存し、queued → processing → ocr_complete へ遷移する", async () => {
    process.env.OCR_COST_PER_1K_TOKENS_USD = "0.1";

    const fixedResult: OcrResult = {
      rawText: "戸籍 花子\n平成3年4月5日出生",
      fields: {
        headOfHousehold: {
          value: "戸籍 太郎",
          confidence: 0.98,
        },
        registeredAddress: {
          value: "東京都千代田区一番町1-1",
          confidence: 0.97,
        },
        persons: [
          {
            name: {
              value: "戸籍 花子",
              confidence: 0.94,
            },
            birthDate: {
              value: "平成3年4月5日",
              confidence: 0.91,
            },
            gender: {
              value: "女",
              confidence: 0.92,
            },
            address: {
              value: "東京都千代田区一番町1-1",
              confidence: 0.88,
            },
            events: [
              {
                type: "birth",
                date: {
                  value: "平成3年4月5日",
                  confidence: 0.91,
                },
                detail: {
                  value: "出生",
                  confidence: 0.95,
                },
              },
            ],
          },
        ],
      },
      confidence: 0.93,
      warnings: [],
      tokensUsed: 2500,
      processingTimeMs: 15,
      documentType: "computerized_koseki",
    };
    const { db, state } = createPipelineDb({
      documents: [
        {
          id: "doc-1",
          caseId: "case-1",
          r2Key: "uploads/doc-1.pdf",
          originalFilename: "doc-1.pdf",
          documentType: "computerized_koseki",
          status: "queued",
          statusHistory: ["queued"],
          ocrResult: {},
          requiresReview: false,
          reviewReason: [],
          ocrConfidence: 0,
          tokensUsed: null,
          estimatedCostUsd: null,
        },
      ],
    });

    const runPipeline = createOcrPipelineRunner({
      db,
      downloadObject: async () => Buffer.from("fake-image-buffer"),
      preprocessImage: async (buffer) => buffer,
      providerFactory: () => new MockOcrProvider({ fixedResult }),
      parseResult: parseKosekiOcrResult,
      logger: {
        error: () => undefined,
      },
    });

    await runPipeline("doc-1");

    expect(state.documents[0].statusHistory).toEqual([
      "queued",
      "processing",
      "ocr_complete",
    ]);
    expect(state.documents[0]).toMatchObject({
      status: "ocr_complete",
      requiresReview: false,
      reviewReason: [],
      ocrConfidence: 0.93,
      tokensUsed: 2500,
      estimatedCostUsd: 0.25,
    });
    expect(state.documents[0].ocrResult).toMatchObject({
      ocr: {
        rawText: "戸籍 花子\n平成3年4月5日出生",
        confidence: 0.93,
      },
      parsed: {
        persons: [
          {
            fullName: "戸籍 花子",
            birthDate: "1991-04-05",
          },
        ],
      },
    });
    expect(state.persons).toHaveLength(1);
    expect(state.persons[0]).toMatchObject({
      caseId: "case-1",
      sourceDocumentId: "doc-1",
      fullName: "戸籍 花子",
    });
    expect(state.personEvents).toEqual([
      expect.objectContaining({
        personId: "person-1",
        documentId: "doc-1",
        eventType: "birth",
        eventDateRaw: "平成3年4月5日",
        rawText: "出生",
        confidence: 0.91,
      }),
    ]);
  });
});
