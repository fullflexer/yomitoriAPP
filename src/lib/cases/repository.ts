import { prisma } from "@/lib/db/client";

import type {
  WorkflowCaseAggregate,
  WorkflowCaseDocument,
  WorkflowCaseHeir,
  WorkflowCasePerson,
  WorkflowCaseRelationship,
} from "./workflow";

type AnyRecord = Record<string, unknown>;

function getDb() {
  return prisma as unknown as {
    case: {
      create(args: AnyRecord): Promise<AnyRecord>;
      findMany(args?: AnyRecord): Promise<AnyRecord[]>;
      findUnique(args: AnyRecord): Promise<AnyRecord | null>;
      findUniqueOrThrow(args: AnyRecord): Promise<AnyRecord>;
      update(args: AnyRecord): Promise<AnyRecord>;
      delete(args: AnyRecord): Promise<AnyRecord>;
    };
    relationship: {
      deleteMany(args: AnyRecord): Promise<unknown>;
      createMany(args: AnyRecord): Promise<unknown>;
    };
    heir: {
      deleteMany(args: AnyRecord): Promise<unknown>;
      createMany(args: AnyRecord): Promise<unknown>;
    };
    document: {
      create(args: AnyRecord): Promise<AnyRecord>;
      findMany(args?: AnyRecord): Promise<AnyRecord[]>;
    };
    person: {
      findMany(args?: AnyRecord): Promise<AnyRecord[]>;
    };
    $transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;
  };
}

export const CASE_AGGREGATE_INCLUDE = {
  documents: {
    orderBy: {
      createdAt: "desc",
    },
  },
  persons: {
    orderBy: {
      createdAt: "asc",
    },
  },
  relationships: true,
  heirs: {
    orderBy: {
      createdAt: "asc",
    },
  },
} as const;

export function getCasesDb() {
  return getDb();
}

function mapPerson(row: AnyRecord): WorkflowCasePerson {
  return {
    id: String(row.id),
    fullName: String(row.fullName ?? ""),
    fullNameKana: (row.fullNameKana as string | null | undefined) ?? null,
    birthDate: (row.birthDate as Date | string | null | undefined) ?? undefined,
    deathDate: (row.deathDate as Date | string | null | undefined) ?? undefined,
    gender: (row.gender as string | null | undefined) ?? null,
    address: (row.address as string | null | undefined) ?? null,
    canonicalPersonId: (row.canonicalPersonId as string | null | undefined) ?? null,
    mergeConfidence: (row.mergeConfidence as number | string | null | undefined) ?? null,
    sourceDocumentId: String(row.sourceDocumentId ?? ""),
  };
}

function mapDocument(row: AnyRecord): WorkflowCaseDocument {
  return {
    id: String(row.id),
    originalFilename: String(row.originalFilename ?? ""),
    documentType: String(row.documentType ?? "unknown"),
    status: String(row.status ?? "unknown"),
    r2Key: String(row.r2Key ?? ""),
    createdAt: (row.createdAt as Date | string | null | undefined) ?? undefined,
    requiresReview: Boolean(row.requiresReview),
    reviewReason: Array.isArray(row.reviewReason)
      ? row.reviewReason.map((value) => String(value))
      : [],
    ocrConfidence: (row.ocrConfidence as number | string | null | undefined) ?? null,
    tokensUsed: (row.tokensUsed as number | null | undefined) ?? null,
    estimatedCostUsd:
      (row.estimatedCostUsd as number | string | null | undefined) ?? null,
    ocrResult: row.ocrResult,
  };
}

function mapRelationship(row: AnyRecord): WorkflowCaseRelationship {
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    fromPersonId: String(row.fromPersonId ?? ""),
    toPersonId: String(row.toPersonId ?? ""),
    relationType: String(row.relationType ?? ""),
    source: (row.source as string | undefined) ?? undefined,
    confidence: (row.confidence as number | string | null | undefined) ?? null,
  };
}

function mapHeir(row: AnyRecord): WorkflowCaseHeir {
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    personId: String(row.personId ?? ""),
    heirClass: String(row.heirClass ?? ""),
    shareNumerator: Number(row.shareNumerator ?? 0),
    shareDenominator: Number(row.shareDenominator ?? 1),
    status: String(row.status ?? ""),
  };
}

export function mapCaseAggregate(row: AnyRecord): WorkflowCaseAggregate {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    status: String(row.status ?? "created"),
    matchingStatus: (row.matchingStatus as string | undefined) ?? undefined,
    deceasedPersonId: (row.deceasedPersonId as string | null | undefined) ?? null,
    inheritanceResult: row.inheritanceResult,
    createdAt: (row.createdAt as Date | string | null | undefined) ?? undefined,
    updatedAt: (row.updatedAt as Date | string | null | undefined) ?? undefined,
    documents: Array.isArray(row.documents) ? row.documents.map(mapDocument) : [],
    persons: Array.isArray(row.persons) ? row.persons.map(mapPerson) : [],
    relationships: Array.isArray(row.relationships)
      ? row.relationships.map(mapRelationship)
      : [],
    heirs: Array.isArray(row.heirs) ? row.heirs.map(mapHeir) : [],
  };
}

export async function listCases() {
  const rows = await getDb().case.findMany({
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      documents: true,
      persons: true,
      heirs: true,
    },
  });

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    status: String(row.status ?? "created"),
    matchingStatus: String(row.matchingStatus ?? "pending"),
    deceasedPersonId: (row.deceasedPersonId as string | null | undefined) ?? null,
    documentCount: Array.isArray(row.documents) ? row.documents.length : 0,
    personCount: Array.isArray(row.persons) ? row.persons.length : 0,
    heirCount: Array.isArray(row.heirs) ? row.heirs.length : 0,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  }));
}

export async function getCaseAggregate(caseId: string) {
  const row = await getDb().case.findUnique({
    where: {
      id: caseId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      matchingStatus: true,
      deceasedPersonId: true,
      inheritanceResult: true,
      createdAt: true,
      updatedAt: true,
      documents: CASE_AGGREGATE_INCLUDE.documents,
      persons: CASE_AGGREGATE_INCLUDE.persons,
      relationships: CASE_AGGREGATE_INCLUDE.relationships,
      heirs: CASE_AGGREGATE_INCLUDE.heirs,
    },
  });

  return row ? mapCaseAggregate(row) : null;
}
