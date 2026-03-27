import { randomUUID } from "node:crypto";

import { query, withTransaction, type DbQuery, type DbTransactionClient } from "@/lib/db/client";

import type {
  WorkflowCaseAggregate,
  WorkflowCaseDocument,
  WorkflowCaseHeir,
  WorkflowCasePerson,
  WorkflowCaseRelationship,
} from "./workflow";

type TimestampLike = Date | string | null | undefined;

type CaseRow = {
  id: string;
  title: string;
  status: string;
  matchingStatus: string | null;
  deceasedPersonId: string | null;
  inheritanceResult: unknown;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
};

type CaseListRow = CaseRow & {
  documentCount: number;
  personCount: number;
  heirCount: number;
};

type DocumentRow = {
  id: string;
  caseId?: string;
  originalFilename: string;
  documentType: string;
  status: string;
  r2Key: string;
  createdAt: TimestampLike;
  requiresReview: boolean;
  reviewReason: string[] | null;
  ocrConfidence: number | string | null;
  tokensUsed: number | null;
  estimatedCostUsd: number | string | null;
  ocrResult: unknown;
};

type PersonRow = {
  id: string;
  fullName: string;
  fullNameKana: string | null;
  birthDate: TimestampLike;
  deathDate: TimestampLike;
  gender: string | null;
  address: string | null;
  canonicalPersonId: string | null;
  mergeConfidence: number | string | null;
  sourceDocumentId: string;
};

type RelationshipRow = {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  relationType: string;
  source: string;
  confidence: number | string | null;
};

type HeirRow = {
  id: string;
  personId: string;
  heirClass: string;
  shareNumerator: number;
  shareDenominator: number;
  status: string;
};

type PersonEventRow = {
  id: string;
  personId: string;
  eventType: string;
  eventDate: TimestampLike;
  eventDateRaw: string | null;
  counterpartPersonId: string | null;
  rawText: string | null;
  confidence: number | string | null;
};

type CreateCaseInput = {
  title: string;
  status: string;
  matchingStatus: string;
  inheritanceResult: unknown;
};

type UpdateCaseInput = {
  title?: string;
  status?: string;
  deceasedPersonId?: string | null;
  inheritanceResult?: unknown;
};

type CreateDocumentInput = {
  caseId: string;
  r2Key: string;
  originalFilename: string;
  documentType: string;
  status: string;
  ocrResult: unknown;
};

type ReplaceCaseInheritanceInput = {
  caseId: string;
  deceasedPersonId: string | null;
  inheritanceResult: unknown;
  relationships: WorkflowCaseRelationship[];
  heirs: WorkflowCaseHeir[];
};

function mapPerson(row: PersonRow): WorkflowCasePerson {
  return {
    id: row.id,
    fullName: row.fullName,
    fullNameKana: row.fullNameKana,
    birthDate: row.birthDate,
    deathDate: row.deathDate,
    gender: row.gender,
    address: row.address,
    canonicalPersonId: row.canonicalPersonId,
    mergeConfidence: row.mergeConfidence,
    sourceDocumentId: row.sourceDocumentId,
  };
}

function mapDocument(row: DocumentRow): WorkflowCaseDocument {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    documentType: row.documentType,
    status: row.status,
    r2Key: row.r2Key,
    createdAt: row.createdAt,
    requiresReview: row.requiresReview,
    reviewReason: row.reviewReason ?? [],
    ocrConfidence: row.ocrConfidence,
    tokensUsed: row.tokensUsed,
    estimatedCostUsd: row.estimatedCostUsd,
    ocrResult: row.ocrResult,
  };
}

function mapRelationship(row: RelationshipRow): WorkflowCaseRelationship {
  return {
    id: row.id,
    fromPersonId: row.fromPersonId,
    toPersonId: row.toPersonId,
    relationType: row.relationType,
    source: row.source,
    confidence: row.confidence,
  };
}

function mapHeir(row: HeirRow): WorkflowCaseHeir {
  return {
    id: row.id,
    personId: row.personId,
    heirClass: row.heirClass,
    shareNumerator: Number(row.shareNumerator),
    shareDenominator: Number(row.shareDenominator),
    status: row.status,
  };
}

function mapCaseAggregate(
  row: CaseRow,
  documents: DocumentRow[],
  persons: PersonRow[],
  relationships: RelationshipRow[],
  heirs: HeirRow[],
): WorkflowCaseAggregate {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    matchingStatus: row.matchingStatus ?? undefined,
    deceasedPersonId: row.deceasedPersonId,
    inheritanceResult: row.inheritanceResult,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documents: documents.map(mapDocument),
    persons: persons.map(mapPerson),
    relationships: relationships.map(mapRelationship),
    heirs: heirs.map(mapHeir),
  };
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

async function updateCaseInternal(
  runQuery: DbQuery,
  caseId: string,
  data: UpdateCaseInput,
) {
  const values: unknown[] = [caseId];
  const assignments: string[] = [];

  if ("title" in data) {
    values.push(data.title ?? null);
    assignments.push(`title = $${values.length}`);
  }

  if ("status" in data) {
    values.push(data.status ?? null);
    assignments.push(`status = $${values.length}`);
  }

  if ("deceasedPersonId" in data) {
    values.push(data.deceasedPersonId ?? null);
    assignments.push(`deceased_person_id = $${values.length}`);
  }

  if ("inheritanceResult" in data) {
    values.push(JSON.stringify(data.inheritanceResult ?? {}));
    assignments.push(`inheritance_result = $${values.length}::jsonb`);
  }

  if (assignments.length === 0) {
    throw new Error("更新対象のフィールドがありません。");
  }

  assignments.push("updated_at = NOW()");

  const result = await runQuery(
    `
      UPDATE cases
      SET ${assignments.join(", ")}
      WHERE id = $1
    `,
    values,
  );

  return (result.rowCount ?? 0) > 0;
}

function getClientQuery(client: DbTransactionClient): DbQuery {
  return (text, params) => client.query(text, params as never[]);
}

export async function listCases() {
  const result = await query<CaseListRow>(
    `
      SELECT
        c.id,
        c.title,
        c.status,
        c.matching_status AS "matchingStatus",
        c.deceased_person_id AS "deceasedPersonId",
        c.inheritance_result AS "inheritanceResult",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        COALESCE(d.document_count, 0)::int AS "documentCount",
        COALESCE(p.person_count, 0)::int AS "personCount",
        COALESCE(h.heir_count, 0)::int AS "heirCount"
      FROM cases c
      LEFT JOIN (
        SELECT case_id, COUNT(*)::int AS document_count
        FROM documents
        GROUP BY case_id
      ) d ON d.case_id = c.id
      LEFT JOIN (
        SELECT case_id, COUNT(*)::int AS person_count
        FROM persons
        GROUP BY case_id
      ) p ON p.case_id = c.id
      LEFT JOIN (
        SELECT case_id, COUNT(*)::int AS heir_count
        FROM heirs
        GROUP BY case_id
      ) h ON h.case_id = c.id
      ORDER BY c.updated_at DESC
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    matchingStatus: row.matchingStatus ?? "pending",
    deceasedPersonId: row.deceasedPersonId,
    documentCount: Number(row.documentCount),
    personCount: Number(row.personCount),
    heirCount: Number(row.heirCount),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  }));
}

export async function getCaseAggregate(caseId: string) {
  const caseResult = await query<CaseRow>(
    `
      SELECT
        id,
        title,
        status,
        matching_status AS "matchingStatus",
        deceased_person_id AS "deceasedPersonId",
        inheritance_result AS "inheritanceResult",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM cases
      WHERE id = $1
    `,
    [caseId],
  );
  const row = caseResult.rows[0];

  if (!row) {
    return null;
  }

  const [documentsResult, personsResult, relationshipsResult, heirsResult] = await Promise.all([
    query<DocumentRow>(
      `
        SELECT
          id,
          case_id AS "caseId",
          original_filename AS "originalFilename",
          document_type AS "documentType",
          status,
          r2_key AS "r2Key",
          created_at AS "createdAt",
          requires_review AS "requiresReview",
          review_reason AS "reviewReason",
          ocr_confidence AS "ocrConfidence",
          tokens_used AS "tokensUsed",
          estimated_cost_usd AS "estimatedCostUsd",
          ocr_result AS "ocrResult"
        FROM documents
        WHERE case_id = $1
        ORDER BY created_at DESC
      `,
      [caseId],
    ),
    query<PersonRow>(
      `
        SELECT
          id,
          full_name AS "fullName",
          full_name_kana AS "fullNameKana",
          birth_date AS "birthDate",
          death_date AS "deathDate",
          gender,
          address,
          canonical_person_id AS "canonicalPersonId",
          merge_confidence AS "mergeConfidence",
          source_document_id AS "sourceDocumentId"
        FROM persons
        WHERE case_id = $1
        ORDER BY created_at ASC
      `,
      [caseId],
    ),
    query<RelationshipRow>(
      `
        SELECT
          id,
          from_person_id AS "fromPersonId",
          to_person_id AS "toPersonId",
          relation_type AS "relationType",
          source,
          confidence
        FROM relationships
        WHERE case_id = $1
        ORDER BY created_at ASC
      `,
      [caseId],
    ),
    query<HeirRow>(
      `
        SELECT
          id,
          person_id AS "personId",
          heir_class AS "heirClass",
          share_numerator AS "shareNumerator",
          share_denominator AS "shareDenominator",
          status
        FROM heirs
        WHERE case_id = $1
        ORDER BY created_at ASC
      `,
      [caseId],
    ),
  ]);

  return mapCaseAggregate(
    row,
    documentsResult.rows,
    personsResult.rows,
    relationshipsResult.rows,
    heirsResult.rows,
  );
}

export async function caseExists(caseId: string) {
  const result = await query<{ id: string }>(
    `
      SELECT id
      FROM cases
      WHERE id = $1
    `,
    [caseId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function listCasePersons(caseId: string) {
  const [personsResult, eventsResult] = await Promise.all([
    query<PersonRow>(
      `
        SELECT
          id,
          full_name AS "fullName",
          full_name_kana AS "fullNameKana",
          birth_date AS "birthDate",
          death_date AS "deathDate",
          gender,
          address,
          canonical_person_id AS "canonicalPersonId",
          merge_confidence AS "mergeConfidence",
          source_document_id AS "sourceDocumentId"
        FROM persons
        WHERE case_id = $1
        ORDER BY created_at ASC
      `,
      [caseId],
    ),
    query<PersonEventRow>(
      `
        SELECT
          pe.id,
          pe.person_id AS "personId",
          pe.event_type AS "eventType",
          pe.event_date AS "eventDate",
          pe.event_date_raw AS "eventDateRaw",
          pe.counterpart_person_id AS "counterpartPersonId",
          pe.raw_text AS "rawText",
          pe.confidence
        FROM person_events pe
        INNER JOIN persons p ON p.id = pe.person_id
        WHERE p.case_id = $1
        ORDER BY pe.created_at ASC
      `,
      [caseId],
    ),
  ]);
  const eventsByPersonId = new Map<string, PersonEventRow[]>();

  for (const event of eventsResult.rows) {
    const current = eventsByPersonId.get(event.personId) ?? [];
    current.push(event);
    eventsByPersonId.set(event.personId, current);
  }

  return personsResult.rows.map((person) => ({
    ...mapPerson(person),
    personEvents: (eventsByPersonId.get(person.id) ?? []).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      eventDate: event.eventDate,
      eventDateRaw: event.eventDateRaw,
      counterpartPersonId: event.counterpartPersonId,
      rawText: event.rawText,
      confidence: event.confidence,
    })),
  }));
}

export async function createCase(input: CreateCaseInput) {
  const result = await query<Pick<CaseRow, "id" | "title" | "status">>(
    `
      INSERT INTO cases (
        id,
        title,
        status,
        matching_status,
        inheritance_result
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, title, status
    `,
    [
      randomUUID(),
      input.title,
      input.status,
      input.matchingStatus,
      JSON.stringify(input.inheritanceResult ?? {}),
    ],
  );

  return result.rows[0];
}

export async function updateCase(caseId: string, data: UpdateCaseInput) {
  return updateCaseInternal(query, caseId, data);
}

export async function deleteCase(caseId: string) {
  const result = await query<{ id: string }>(
    `
      DELETE FROM cases
      WHERE id = $1
      RETURNING id
    `,
    [caseId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function createDocument(input: CreateDocumentInput) {
  const result = await query<DocumentRow>(
    `
      INSERT INTO documents (
        id,
        case_id,
        r2_key,
        original_filename,
        document_type,
        status,
        ocr_result
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING
        id,
        case_id AS "caseId",
        original_filename AS "originalFilename",
        document_type AS "documentType",
        status,
        r2_key AS "r2Key",
        created_at AS "createdAt",
        requires_review AS "requiresReview",
        review_reason AS "reviewReason",
        ocr_confidence AS "ocrConfidence",
        tokens_used AS "tokensUsed",
        estimated_cost_usd AS "estimatedCostUsd",
        ocr_result AS "ocrResult"
    `,
    [
      randomUUID(),
      input.caseId,
      input.r2Key,
      input.originalFilename,
      input.documentType,
      input.status,
      JSON.stringify(input.ocrResult ?? {}),
    ],
  );

  return result.rows[0];
}

export async function replaceCaseInheritanceData(input: ReplaceCaseInheritanceInput) {
  await withTransaction(async (client) => {
    const clientQuery = getClientQuery(client);

    await clientQuery(
      `
        DELETE FROM relationships
        WHERE case_id = $1
      `,
      [input.caseId],
    );

    if (input.relationships.length > 0) {
      const relationshipValues = input.relationships.flatMap((relationship) => [
        randomUUID(),
        input.caseId,
        relationship.fromPersonId,
        relationship.toPersonId,
        relationship.relationType,
        relationship.source ?? "derived",
        relationship.confidence ?? 0.8,
      ]);

      await clientQuery(
        `
          INSERT INTO relationships (
            id,
            case_id,
            from_person_id,
            to_person_id,
            relation_type,
            source,
            confidence
          )
          VALUES ${buildInsertPlaceholders(input.relationships.length, 7)}
        `,
        relationshipValues,
      );
    }

    await clientQuery(
      `
        DELETE FROM heirs
        WHERE case_id = $1
      `,
      [input.caseId],
    );

    if (input.heirs.length > 0) {
      const heirValues = input.heirs.flatMap((heir) => [
        randomUUID(),
        input.caseId,
        heir.personId,
        heir.heirClass,
        heir.shareNumerator,
        heir.shareDenominator,
        heir.status,
      ]);

      await clientQuery(
        `
          INSERT INTO heirs (
            id,
            case_id,
            person_id,
            heir_class,
            share_numerator,
            share_denominator,
            status
          )
          VALUES ${buildInsertPlaceholders(input.heirs.length, 7)}
        `,
        heirValues,
      );
    }

    const updated = await updateCaseInternal(clientQuery, input.caseId, {
      deceasedPersonId: input.deceasedPersonId,
      inheritanceResult: input.inheritanceResult,
    });

    if (!updated) {
      throw new Error("ケースが見つかりません。");
    }
  });
}
