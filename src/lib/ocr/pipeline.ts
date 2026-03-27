import { randomUUID } from "node:crypto";

import { query, withTransaction, type DbQuery, type DbTransactionClient } from "@/lib/db/client";
import { OcrAdapter } from "@/lib/ocr/adapter";
import { createOcrProvider } from "@/lib/ocr/provider-factory";
import type { DocumentType, OcrProvider, OcrResult } from "@/lib/ocr/types";
import { parseKosekiOcrResult } from "@/lib/parser/koseki-parser";
import type { ParseResult, ParsedEvent, ParsedPerson } from "@/lib/parser/types";

type PipelineDocument = {
  id: string;
  caseId: string;
  r2Key: string;
  originalFilename: string;
  documentType: string;
  status: string;
};

type PipelineDocumentUpdate = {
  status?: string;
  ocrResult?: unknown;
  requiresReview?: boolean;
  reviewReason?: string[];
  ocrConfidence?: number;
  tokensUsed?: number;
  estimatedCostUsd?: number;
};

type PipelinePersonCreateData = {
  caseId: string;
  sourceDocumentId: string;
  fullName: string;
  fullNameKana: string | null;
  birthDate: string | null;
  deathDate: string | null;
  gender: string | null;
  address: string | null;
};

type PipelinePersonEventCreateData = {
  personId: string;
  documentId: string;
  eventType: string;
  eventDate: string | null;
  eventDateRaw: string | null;
  counterpartPersonId: string | null;
  rawText: string | null;
  confidence: number | null;
};

type PipelineDocumentRow = {
  id: string;
  caseId: string;
  r2Key: string;
  originalFilename: string;
  documentType: string;
  status: string;
};

export type OcrPipelineTransactionDb = {
  updateDocument(documentId: string, data: PipelineDocumentUpdate): Promise<void>;
  deletePersonsBySourceDocumentId(documentId: string): Promise<number>;
  deletePersonEventsByDocumentId(documentId: string): Promise<number>;
  insertPerson(data: PipelinePersonCreateData): Promise<{ id: string }>;
  insertPersonEvents(data: PipelinePersonEventCreateData[]): Promise<number>;
};

export type OcrPipelineDb = {
  getDocumentOrThrow(documentId: string): Promise<PipelineDocument>;
  updateDocument(documentId: string, data: PipelineDocumentUpdate): Promise<void>;
  runInTransaction<T>(callback: (db: OcrPipelineTransactionDb) => Promise<T>): Promise<T>;
};

export type OcrPipelineDeps = {
  db: OcrPipelineDb;
  downloadObject: (key: string) => Promise<Buffer>;
  preprocessImage: (buffer: Buffer) => Promise<Buffer>;
  providerFactory: () => OcrProvider | Promise<OcrProvider>;
  parseResult: (result: OcrResult) => ParseResult;
  logger: Pick<Console, "error">;
};

type PersistedPerson = {
  parsedPerson: ParsedPerson;
  persistedId: string;
};

const defaultPipelineDb: OcrPipelineDb = {
  async getDocumentOrThrow(documentId) {
    const result = await query<PipelineDocumentRow>(
      `
        SELECT
          id,
          case_id AS "caseId",
          r2_key AS "r2Key",
          original_filename AS "originalFilename",
          document_type AS "documentType",
          status
        FROM documents
        WHERE id = $1
      `,
      [documentId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error(`Document not found: ${documentId}`);
    }

    return row;
  },
  async updateDocument(documentId, data) {
    await updateDocumentRecord(query, documentId, data);
  },
  async runInTransaction(callback) {
    return withTransaction((client) => callback(createPipelineTransactionDb(client)));
  },
};

export async function runOcrPipeline(documentId: string): Promise<void> {
  const runner = createOcrPipelineRunner();
  await runner(documentId);
}

export function createOcrPipelineRunner(
  overrides: Partial<OcrPipelineDeps> = {},
): (documentId: string) => Promise<void> {
  return async (documentId: string) => {
    const deps = await resolveOcrPipelineDeps(overrides);
    let document: PipelineDocument | null = null;

    try {
      document = await deps.db.getDocumentOrThrow(documentId);

      await deps.db.updateDocument(documentId, {
        status: "processing",
      });

      const originalBuffer = await deps.downloadObject(document.r2Key);
      const preprocessedBuffer = await deps.preprocessImage(originalBuffer);
      const provider = await deps.providerFactory();
      const adapter = new OcrAdapter(provider);
      const ocrResult = await adapter.extractWithRetry({
        imageBuffer: preprocessedBuffer,
        mimeType: "image/jpeg",
        documentType: normalizeDocumentType(document.documentType),
      });
      const parseResult = deps.parseResult(ocrResult);

      await persistPipelineSuccess({
        db: deps.db,
        document,
        ocrResult,
        parseResult,
      });
    } catch (error) {
      deps.logger.error("OCR pipeline failed", {
        documentId,
        error,
      });

      if (document) {
        await deps.db.updateDocument(document.id, {
          status: "ocr_failed",
        });
      }

      throw error;
    }
  };
}

async function resolveOcrPipelineDeps(
  overrides: Partial<OcrPipelineDeps>,
): Promise<OcrPipelineDeps> {
  return {
    db: overrides.db ?? defaultPipelineDb,
    downloadObject: overrides.downloadObject ?? defaultDownloadObject,
    preprocessImage: overrides.preprocessImage ?? defaultPreprocessImage,
    providerFactory: overrides.providerFactory ?? createDefaultProvider,
    parseResult: overrides.parseResult ?? parseKosekiOcrResult,
    logger: overrides.logger ?? console,
  };
}

async function persistPipelineSuccess({
  db,
  document,
  ocrResult,
  parseResult,
}: {
  db: OcrPipelineDb;
  document: PipelineDocument;
  ocrResult: OcrResult;
  parseResult: ParseResult;
}) {
  const reviewReasons = dedupeReviewReasons([
    ...parseResult.warnings,
    ...parseResult.unsupportedReasons,
  ]);
  const tokensUsed = ocrResult.tokensUsed ?? 0;
  const estimatedCostUsd = estimateCostUsd(tokensUsed);
  const persistedResult = {
    ocr: ocrResult,
    parsed: parseResult,
  };

  await db.runInTransaction(async (tx) => {
    await tx.deletePersonEventsByDocumentId(document.id);
    await tx.deletePersonsBySourceDocumentId(document.id);

    const persistedPersons = await persistPersons({
      tx,
      caseId: document.caseId,
      documentId: document.id,
      persons: parseResult.persons,
    });

    const personEvents = buildPersonEventCreateData({
      documentId: document.id,
      persons: persistedPersons,
    });

    if (personEvents.length > 0) {
      await tx.insertPersonEvents(personEvents);
    }

    await tx.updateDocument(document.id, {
      status: "ocr_complete",
      ocrResult: persistedResult,
      requiresReview: reviewReasons.length > 0,
      reviewReason: reviewReasons,
      ocrConfidence: roundConfidence(ocrResult.confidence),
      tokensUsed,
      estimatedCostUsd,
    });
  });
}

async function persistPersons({
  tx,
  caseId,
  documentId,
  persons,
}: {
  tx: OcrPipelineTransactionDb;
  caseId: string;
  documentId: string;
  persons: ParsedPerson[];
}): Promise<PersistedPerson[]> {
  const persisted: PersistedPerson[] = [];

  for (const person of persons) {
    const created = await tx.insertPerson({
      caseId,
      sourceDocumentId: documentId,
      fullName: person.fullName,
      fullNameKana: person.fullNameKana ?? null,
      birthDate: toDateOnly(person.birthDate),
      deathDate: toDateOnly(person.deathDate),
      gender: person.gender ?? null,
      address: person.address ?? null,
    });

    persisted.push({
      parsedPerson: person,
      persistedId: created.id,
    });
  }

  return persisted;
}

function buildPersonEventCreateData({
  documentId,
  persons,
}: {
  documentId: string;
  persons: PersistedPerson[];
}): PipelinePersonEventCreateData[] {
  const personIdIndex = buildPersonIdIndex(persons);

  return persons.flatMap(({ persistedId, parsedPerson }) =>
    parsedPerson.events.map((event) => ({
      personId: persistedId,
      documentId,
      eventType: event.type,
      eventDate: toDateOnly(event.date),
      eventDateRaw: event.dateRaw ?? null,
      counterpartPersonId: resolveCounterpartPersonId({
        event,
        currentPersonId: persistedId,
        personIdIndex,
      }),
      rawText: event.detail ?? null,
      confidence: event.confidence >= 0 ? roundConfidence(event.confidence) : null,
    })),
  );
}

function buildPersonIdIndex(persons: PersistedPerson[]) {
  const index = new Map<string, string[]>();

  for (const person of persons) {
    const key = normalizeNameKey(person.parsedPerson.fullName);
    const existing = index.get(key) ?? [];
    existing.push(person.persistedId);
    index.set(key, existing);
  }

  return index;
}

function resolveCounterpartPersonId({
  event,
  currentPersonId,
  personIdIndex,
}: {
  event: ParsedEvent;
  currentPersonId: string;
  personIdIndex: Map<string, string[]>;
}) {
  if (!event.counterpartName) {
    return null;
  }

  const matches = (personIdIndex.get(normalizeNameKey(event.counterpartName)) ?? []).filter(
    (candidateId) => candidateId !== currentPersonId,
  );

  return matches.length === 1 ? matches[0] : null;
}

function normalizeNameKey(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function dedupeReviewReasons(reasons: string[]) {
  return [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))];
}

function normalizeDocumentType(documentType: string): DocumentType {
  switch (documentType) {
    case "computerized_koseki":
    case "original_koseki":
    case "removed_koseki":
      return documentType;
    default:
      return "unknown";
  }
}

function toDateOnly(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return value;
}

function estimateCostUsd(tokensUsed: number) {
  const configuredRate = Number(process.env.OCR_COST_PER_1K_TOKENS_USD ?? "0");
  const safeRate = Number.isFinite(configuredRate) && configuredRate >= 0 ? configuredRate : 0;

  return roundUsd((tokensUsed / 1_000) * safeRate);
}

function roundUsd(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function roundConfidence(value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 10_000) / 10_000;
}

function buildInsertPlaceholders(rowCount: number, columnCount: number) {
  const values: string[] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowValues: string[] = [];

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      rowValues.push(`$${rowIndex * columnCount + columnIndex + 1}`);
    }

    values.push(`(${rowValues.join(", ")})`);
  }

  return values.join(", ");
}

function getClientQuery(client: DbTransactionClient): DbQuery {
  return (text, params) => client.query(text, params as never[]);
}

async function updateDocumentRecord(
  runQuery: DbQuery,
  documentId: string,
  data: PipelineDocumentUpdate,
) {
  const values: unknown[] = [documentId];
  const assignments: string[] = [];

  if ("status" in data) {
    values.push(data.status ?? null);
    assignments.push(`status = $${values.length}`);
  }

  if ("ocrResult" in data) {
    values.push(JSON.stringify(data.ocrResult ?? {}));
    assignments.push(`ocr_result = $${values.length}::jsonb`);
  }

  if ("requiresReview" in data) {
    values.push(data.requiresReview ?? false);
    assignments.push(`requires_review = $${values.length}`);
  }

  if ("reviewReason" in data) {
    values.push(data.reviewReason ?? []);
    assignments.push(`review_reason = $${values.length}::text[]`);
  }

  if ("ocrConfidence" in data) {
    values.push(data.ocrConfidence ?? 0);
    assignments.push(`ocr_confidence = $${values.length}`);
  }

  if ("tokensUsed" in data) {
    values.push(data.tokensUsed ?? null);
    assignments.push(`tokens_used = $${values.length}`);
  }

  if ("estimatedCostUsd" in data) {
    values.push(data.estimatedCostUsd ?? null);
    assignments.push(`estimated_cost_usd = $${values.length}`);
  }

  if (assignments.length === 0) {
    return;
  }

  const result = await runQuery(
    `
      UPDATE documents
      SET ${assignments.join(", ")}
      WHERE id = $1
    `,
    values,
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error(`Document not found: ${documentId}`);
  }
}

function createPipelineTransactionDb(client: DbTransactionClient): OcrPipelineTransactionDb {
  const clientQuery = getClientQuery(client);

  return {
    updateDocument(documentId, data) {
      return updateDocumentRecord(clientQuery, documentId, data);
    },
    async deletePersonsBySourceDocumentId(documentId) {
      const result = await clientQuery(
        `
          DELETE FROM persons
          WHERE source_document_id = $1
        `,
        [documentId],
      );

      return result.rowCount ?? 0;
    },
    async deletePersonEventsByDocumentId(documentId) {
      const result = await clientQuery(
        `
          DELETE FROM person_events
          WHERE document_id = $1
        `,
        [documentId],
      );

      return result.rowCount ?? 0;
    },
    async insertPerson(data) {
      const id = randomUUID();

      await clientQuery(
        `
          INSERT INTO persons (
            id,
            case_id,
            source_document_id,
            full_name,
            full_name_kana,
            birth_date,
            death_date,
            gender,
            address
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          id,
          data.caseId,
          data.sourceDocumentId,
          data.fullName,
          data.fullNameKana,
          data.birthDate,
          data.deathDate,
          data.gender,
          data.address,
        ],
      );

      return { id };
    },
    async insertPersonEvents(data) {
      if (data.length === 0) {
        return 0;
      }

      const values = data.flatMap((event) => [
        randomUUID(),
        event.personId,
        event.documentId,
        event.eventType,
        event.eventDate,
        event.eventDateRaw,
        event.counterpartPersonId,
        event.rawText,
        event.confidence,
      ]);
      const result = await clientQuery(
        `
          INSERT INTO person_events (
            id,
            person_id,
            document_id,
            event_type,
            event_date,
            event_date_raw,
            counterpart_person_id,
            raw_text,
            confidence
          )
          VALUES ${buildInsertPlaceholders(data.length, 9)}
        `,
        values,
      );

      return result.rowCount ?? 0;
    },
  };
}

async function defaultPreprocessImage(buffer: Buffer) {
  const { preprocessImage } = await import("@/lib/ocr/preprocessing");
  return preprocessImage(buffer);
}

async function defaultDownloadObject(key: string) {
  const { downloadUploadObject } = await import("@/lib/storage/r2-client");
  return downloadUploadObject(key);
}

async function createDefaultProvider(): Promise<OcrProvider> {
  return createOcrProvider();
}
