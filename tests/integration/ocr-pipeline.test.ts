import { afterEach, describe, expect, it } from "vitest";

import {
  createOcrPipelineRunner,
  type OcrPipelinePrisma,
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
  birthDate: Date | null;
  deathDate: Date | null;
  gender: string | null;
  address: string | null;
};

type StoredPersonEvent = {
  personId: string;
  documentId: string;
  eventType: string;
  eventDate: Date | null;
  eventDateRaw: string | null;
  counterpartPersonId: string | null;
  rawText: string | null;
  confidence: number | null;
};

function createPipelinePrisma(seed: { documents: StoredDocument[] }) {
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

  const prisma: OcrPipelinePrisma = {
    document: {
      async findUniqueOrThrow(args) {
        const document = state.documents.find((entry) => entry.id === args.where.id);

        if (!document) {
          throw new Error(`Document not found: ${args.where.id}`);
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
      async update(args) {
        const document = state.documents.find((entry) => entry.id === args.where.id);

        if (!document) {
          throw new Error(`Document not found: ${args.where.id}`);
        }

        if (args.data.status) {
          document.status = args.data.status;
          document.statusHistory.push(args.data.status);
        }

        if (args.data.ocrResult !== undefined) {
          document.ocrResult = args.data.ocrResult;
        }

        if (args.data.requiresReview !== undefined) {
          document.requiresReview = args.data.requiresReview;
        }

        if (args.data.reviewReason !== undefined) {
          document.reviewReason = [...args.data.reviewReason];
        }

        if (args.data.ocrConfidence !== undefined) {
          document.ocrConfidence = args.data.ocrConfidence;
        }

        if (args.data.tokensUsed !== undefined) {
          document.tokensUsed = args.data.tokensUsed;
        }

        if (args.data.estimatedCostUsd !== undefined) {
          document.estimatedCostUsd = args.data.estimatedCostUsd;
        }

        return document;
      },
    },
    person: {
      async deleteMany(args) {
        const initialLength = state.persons.length;
        state.persons = state.persons.filter(
          (person) => person.sourceDocumentId !== args.where.sourceDocumentId,
        );

        return {
          count: initialLength - state.persons.length,
        };
      },
      async create(args) {
        state.personSequence += 1;
        const person: StoredPerson = {
          id: `person-${state.personSequence}`,
          caseId: args.data.caseId,
          sourceDocumentId: args.data.sourceDocumentId,
          fullName: args.data.fullName,
          fullNameKana: args.data.fullNameKana,
          birthDate: args.data.birthDate,
          deathDate: args.data.deathDate,
          gender: args.data.gender,
          address: args.data.address,
        };

        state.persons.push(person);

        return {
          id: person.id,
        };
      },
    },
    personEvent: {
      async deleteMany(args) {
        const initialLength = state.personEvents.length;
        state.personEvents = state.personEvents.filter(
          (event) => event.documentId !== args.where.documentId,
        );

        return {
          count: initialLength - state.personEvents.length,
        };
      },
      async createMany(args) {
        state.personEvents.push(...args.data);
        return {
          count: args.data.length,
        };
      },
    },
    async $transaction(callback) {
      return callback({
        document: prisma.document,
        person: prisma.person,
        personEvent: prisma.personEvent,
      });
    },
  };

  return { prisma, state };
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
    const { prisma, state } = createPipelinePrisma({
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
      prisma,
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
