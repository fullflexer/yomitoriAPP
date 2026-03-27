import { query, withTransaction, type DbQuery } from "@/lib/db/client";

type ExpiredDocumentRecord = {
  id: string;
  r2Key: string;
};

type ExpiredCaseRecord = {
  id: string;
  documents: ExpiredDocumentRecord[];
};

type CleanupExpiredCounts = {
  cases: number;
  documents: number;
  persons: number;
  personEvents: number;
  relationships: number;
  heirs: number;
  r2Objects: number;
};

type CleanupDbCounts = Omit<CleanupExpiredCounts, "r2Objects">;

type ExpiredCaseRow = {
  id: string;
  documentId: string | null;
  r2Key: string | null;
};

export type CleanupExpiredDb = {
  listExpiredCases(cutoff: Date): Promise<ExpiredCaseRecord[]>;
  deleteExpiredData(caseIds: string[], documentIds: string[]): Promise<CleanupDbCounts>;
};

export type CleanupExpiredResult = {
  cutoff: Date;
  expiredCaseIds: string[];
  counts: CleanupExpiredCounts;
  failedObjectKeys: string[];
};

type CleanupExpiredOptions = {
  db?: CleanupExpiredDb;
  deleteObject?: (key: string) => Promise<void>;
  now?: Date;
  cutoffHours?: number;
};

const DEFAULT_CUTOFF_HOURS = 24;

const defaultCleanupDb: CleanupExpiredDb = {
  async listExpiredCases(cutoff) {
    const result = await query<ExpiredCaseRow>(
      `
        SELECT
          c.id,
          d.id AS "documentId",
          d.r2_key AS "r2Key"
        FROM cases c
        LEFT JOIN documents d ON d.case_id = c.id
        WHERE c.created_at <= $1
        ORDER BY c.id ASC, d.created_at ASC
      `,
      [cutoff],
    );

    const cases = new Map<string, ExpiredCaseRecord>();

    for (const row of result.rows) {
      const current = cases.get(row.id) ?? {
        id: row.id,
        documents: [],
      };

      if (row.documentId && row.r2Key) {
        current.documents.push({
          id: row.documentId,
          r2Key: row.r2Key,
        });
      }

      cases.set(row.id, current);
    }

    return [...cases.values()];
  },
  async deleteExpiredData(caseIds, documentIds) {
    if (caseIds.length === 0) {
      return {
        cases: 0,
        documents: 0,
        persons: 0,
        personEvents: 0,
        relationships: 0,
        heirs: 0,
      };
    }

    return withTransaction(async (client) => {
      const clientQuery: DbQuery = (text, params) => client.query(text, params as never[]);
      const personEvents =
        documentIds.length > 0
          ? await clientQuery(
              `
                DELETE FROM person_events
                WHERE document_id = ANY($1::uuid[])
              `,
              [documentIds],
            )
          : { rowCount: 0 };

      await clientQuery(
        `
          UPDATE cases
          SET deceased_person_id = NULL
          WHERE id = ANY($1::uuid[])
        `,
        [caseIds],
      );

      const heirs = await clientQuery(
        `
          DELETE FROM heirs
          WHERE case_id = ANY($1::uuid[])
        `,
        [caseIds],
      );
      const relationships = await clientQuery(
        `
          DELETE FROM relationships
          WHERE case_id = ANY($1::uuid[])
        `,
        [caseIds],
      );
      const persons = await clientQuery(
        `
          DELETE FROM persons
          WHERE case_id = ANY($1::uuid[])
        `,
        [caseIds],
      );
      const documents = await clientQuery(
        `
          DELETE FROM documents
          WHERE case_id = ANY($1::uuid[])
        `,
        [caseIds],
      );
      const cases = await clientQuery(
        `
          DELETE FROM cases
          WHERE id = ANY($1::uuid[])
        `,
        [caseIds],
      );

      return {
        cases: cases.rowCount ?? 0,
        documents: documents.rowCount ?? 0,
        persons: persons.rowCount ?? 0,
        personEvents: personEvents.rowCount ?? 0,
        relationships: relationships.rowCount ?? 0,
        heirs: heirs.rowCount ?? 0,
      };
    });
  },
};

function buildEmptyCounts(): CleanupExpiredCounts {
  return {
    cases: 0,
    documents: 0,
    persons: 0,
    personEvents: 0,
    relationships: 0,
    heirs: 0,
    r2Objects: 0,
  };
}

function dedupeObjectKeys(cases: ExpiredCaseRecord[]) {
  return [...new Set(cases.flatMap((entry) => entry.documents.map((doc) => doc.r2Key)))];
}

function getCutoff(now: Date, cutoffHours: number) {
  return new Date(now.getTime() - cutoffHours * 60 * 60 * 1000);
}

export async function cleanupExpiredCases({
  db = defaultCleanupDb,
  deleteObject = async () => {},
  now = new Date(),
  cutoffHours = DEFAULT_CUTOFF_HOURS,
}: CleanupExpiredOptions): Promise<CleanupExpiredResult> {
  const cutoff = getCutoff(now, cutoffHours);
  const expiredCases = await db.listExpiredCases(cutoff);

  if (expiredCases.length === 0) {
    return {
      cutoff,
      expiredCaseIds: [],
      counts: buildEmptyCounts(),
      failedObjectKeys: [],
    };
  }

  const caseIds = expiredCases.map((entry) => entry.id);
  const documentIds = expiredCases.flatMap((entry) => entry.documents.map((doc) => doc.id));
  const r2Keys = dedupeObjectKeys(expiredCases);
  const counts = await db.deleteExpiredData(caseIds, documentIds);

  const objectDeletionResults = await Promise.allSettled(
    r2Keys.map(async (key) => {
      await deleteObject(key);
      return key;
    }),
  );

  const failedObjectKeys = objectDeletionResults.flatMap((result, index) =>
    result.status === "rejected" ? [r2Keys[index]] : [],
  );

  return {
    cutoff,
    expiredCaseIds: caseIds,
    counts: {
      ...counts,
      r2Objects: r2Keys.length - failedObjectKeys.length,
    },
    failedObjectKeys,
  };
}

export function formatCleanupReport(result: CleanupExpiredResult) {
  return [
    `cutoff=${result.cutoff.toISOString()}`,
    `casesDeleted=${result.counts.cases}`,
    `documentsDeleted=${result.counts.documents}`,
    `personsDeleted=${result.counts.persons}`,
    `personEventsDeleted=${result.counts.personEvents}`,
    `relationshipsDeleted=${result.counts.relationships}`,
    `heirsDeleted=${result.counts.heirs}`,
    `r2ObjectsDeleted=${result.counts.r2Objects}`,
  ].join(" ");
}
