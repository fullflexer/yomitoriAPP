import { OcrAdapter } from "@/lib/ocr/adapter";
import { MockOcrProvider } from "@/lib/ocr/providers/mock";
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

type PipelineDocumentDelegate = {
  findUniqueOrThrow(args: {
    where: { id: string };
    select: {
      id: true;
      caseId: true;
      r2Key: true;
      originalFilename: true;
      documentType: true;
      status: true;
    };
  }): Promise<PipelineDocument>;
  update(args: {
    where: { id: string };
    data: PipelineDocumentUpdate;
  }): Promise<unknown>;
};

type PipelinePersonCreateData = {
  caseId: string;
  sourceDocumentId: string;
  fullName: string;
  fullNameKana: string | null;
  birthDate: Date | null;
  deathDate: Date | null;
  gender: string | null;
  address: string | null;
};

type PipelinePersonDelegate = {
  deleteMany(args: {
    where: { sourceDocumentId: string };
  }): Promise<{ count: number }>;
  create(args: {
    data: PipelinePersonCreateData;
    select: {
      id: true;
    };
  }): Promise<{ id: string }>;
};

type PipelinePersonEventCreateData = {
  personId: string;
  documentId: string;
  eventType: string;
  eventDate: Date | null;
  eventDateRaw: string | null;
  counterpartPersonId: string | null;
  rawText: string | null;
  confidence: number | null;
};

type PipelinePersonEventDelegate = {
  deleteMany(args: {
    where: { documentId: string };
  }): Promise<{ count: number }>;
  createMany(args: {
    data: PipelinePersonEventCreateData[];
  }): Promise<{ count: number }>;
};

type OcrPipelineTransaction = {
  document: PipelineDocumentDelegate;
  person: PipelinePersonDelegate;
  personEvent: PipelinePersonEventDelegate;
};

export type OcrPipelinePrisma = OcrPipelineTransaction & {
  $transaction<T>(callback: (tx: OcrPipelineTransaction) => Promise<T>): Promise<T>;
};

export type OcrPipelineDeps = {
  prisma: OcrPipelinePrisma;
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

const DOCUMENT_SELECT = {
  id: true,
  caseId: true,
  r2Key: true,
  originalFilename: true,
  documentType: true,
  status: true,
} as const;

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
      document = await deps.prisma.document.findUniqueOrThrow({
        where: {
          id: documentId,
        },
        select: DOCUMENT_SELECT,
      });

      await deps.prisma.document.update({
        where: {
          id: documentId,
        },
        data: {
          status: "processing",
        },
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
        prisma: deps.prisma,
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
        await deps.prisma.document.update({
          where: {
            id: document.id,
          },
          data: {
            status: "ocr_failed",
          },
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
    prisma: overrides.prisma ?? (await getDefaultPrisma()),
    downloadObject: overrides.downloadObject ?? defaultDownloadObject,
    preprocessImage: overrides.preprocessImage ?? defaultPreprocessImage,
    providerFactory: overrides.providerFactory ?? createDefaultProvider,
    parseResult: overrides.parseResult ?? parseKosekiOcrResult,
    logger: overrides.logger ?? console,
  };
}

async function persistPipelineSuccess({
  prisma,
  document,
  ocrResult,
  parseResult,
}: {
  prisma: OcrPipelinePrisma;
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

  await prisma.$transaction(async (tx) => {
    await tx.personEvent.deleteMany({
      where: {
        documentId: document.id,
      },
    });
    await tx.person.deleteMany({
      where: {
        sourceDocumentId: document.id,
      },
    });

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
      await tx.personEvent.createMany({
        data: personEvents,
      });
    }

    await tx.document.update({
      where: {
        id: document.id,
      },
      data: {
        status: "ocr_complete",
        ocrResult: persistedResult,
        requiresReview: reviewReasons.length > 0,
        reviewReason: reviewReasons,
        ocrConfidence: roundConfidence(ocrResult.confidence),
        tokensUsed,
        estimatedCostUsd,
      },
    });
  });
}

async function persistPersons({
  tx,
  caseId,
  documentId,
  persons,
}: {
  tx: OcrPipelineTransaction;
  caseId: string;
  documentId: string;
  persons: ParsedPerson[];
}): Promise<PersistedPerson[]> {
  const persisted: PersistedPerson[] = [];

  for (const person of persons) {
    const created = await tx.person.create({
      data: {
        caseId,
        sourceDocumentId: documentId,
        fullName: person.fullName,
        fullNameKana: person.fullNameKana ?? null,
        birthDate: toDateOnly(person.birthDate),
        deathDate: toDateOnly(person.deathDate),
        gender: person.gender ?? null,
        address: person.address ?? null,
      },
      select: {
        id: true,
      },
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

  return new Date(`${value}T00:00:00.000Z`);
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

async function defaultPreprocessImage(buffer: Buffer) {
  const { preprocessImage } = await import("@/lib/ocr/preprocessing");
  return preprocessImage(buffer);
}

async function defaultDownloadObject(key: string) {
  const { downloadUploadObject } = await import("@/lib/storage/r2-client");
  return downloadUploadObject(key);
}

async function getDefaultPrisma(): Promise<OcrPipelinePrisma> {
  const { prisma } = await import("@/lib/db/client");
  return prisma as unknown as OcrPipelinePrisma;
}

async function createDefaultProvider(): Promise<OcrProvider> {
  if (process.env.OCR_PROVIDER === "mock") {
    return new MockOcrProvider();
  }

  const { ClaudeVisionProvider } = await import("@/lib/ocr/providers/claude-vision");

  return new ClaudeVisionProvider();
}
