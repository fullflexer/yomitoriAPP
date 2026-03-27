import { describe, expect, it, vi } from "vitest";

import {
  cleanupExpiredCases,
  type CleanupExpiredDb,
} from "../../../src/lib/cleanup/cleanup-expired";

type StoredCase = {
  id: string;
  createdAt: Date;
  deceasedPersonId: string | null;
};

type StoredDocument = {
  id: string;
  caseId: string;
  r2Key: string;
};

type StoredPerson = {
  id: string;
  caseId: string;
  sourceDocumentId: string;
};

type StoredPersonEvent = {
  id: string;
  documentId: string;
  personId: string;
};

type StoredRelationship = {
  id: string;
  caseId: string;
};

type StoredHeir = {
  id: string;
  caseId: string;
  personId: string;
};

function removeByIds<T extends { id: string }>(items: T[], ids: string[]) {
  const idSet = new Set(ids);
  const kept = items.filter((item) => !idSet.has(item.id));
  const deletedCount = items.length - kept.length;

  return {
    items: kept,
    count: deletedCount,
  };
}

function removeByCaseIds<T extends { caseId: string }>(items: T[], caseIds: string[]) {
  const caseIdSet = new Set(caseIds);
  const kept = items.filter((item) => !caseIdSet.has(item.caseId));
  const deletedCount = items.length - kept.length;

  return {
    items: kept,
    count: deletedCount,
  };
}

function removeByDocumentIds<T extends { documentId: string }>(
  items: T[],
  documentIds: string[],
) {
  const documentIdSet = new Set(documentIds);
  const kept = items.filter((item) => !documentIdSet.has(item.documentId));
  const deletedCount = items.length - kept.length;

  return {
    items: kept,
    count: deletedCount,
  };
}

function createCleanupDb(seed?: {
  cases?: StoredCase[];
  documents?: StoredDocument[];
  persons?: StoredPerson[];
  personEvents?: StoredPersonEvent[];
  relationships?: StoredRelationship[];
  heirs?: StoredHeir[];
}) {
  const state = {
    cases: seed?.cases ?? [],
    documents: seed?.documents ?? [],
    persons: seed?.persons ?? [],
    personEvents: seed?.personEvents ?? [],
    relationships: seed?.relationships ?? [],
    heirs: seed?.heirs ?? [],
  };

  const db: CleanupExpiredDb = {
    async listExpiredCases(cutoff) {
      return state.cases
        .filter((entry) => entry.createdAt <= cutoff)
        .map((entry) => ({
          id: entry.id,
          documents: state.documents
            .filter((document) => document.caseId === entry.id)
            .map((document) => ({
              id: document.id,
              r2Key: document.r2Key,
            })),
        }));
    },
    async deleteExpiredData(caseIds, documentIds) {
      const caseIdSet = new Set(caseIds);

      state.cases = state.cases.map((entry) =>
        caseIdSet.has(entry.id)
          ? {
              ...entry,
              deceasedPersonId: null,
            }
          : entry,
      );

      const personEvents = removeByDocumentIds(state.personEvents, documentIds);
      state.personEvents = personEvents.items;

      const heirs = removeByCaseIds(state.heirs, caseIds);
      state.heirs = heirs.items;

      const relationships = removeByCaseIds(state.relationships, caseIds);
      state.relationships = relationships.items;

      const persons = removeByCaseIds(state.persons, caseIds);
      state.persons = persons.items;

      const documents = removeByCaseIds(state.documents, caseIds);
      state.documents = documents.items;

      const cases = removeByIds(state.cases, caseIds);
      state.cases = cases.items;

      return {
        cases: cases.count,
        documents: documents.count,
        persons: persons.count,
        personEvents: personEvents.count,
        relationships: relationships.count,
        heirs: heirs.count,
      };
    },
  };

  return { db, state };
}

describe("cleanupExpiredCases", () => {
  it("24時間超過の案件と関連データを削除し、24時間以内は残す", async () => {
    const now = new Date("2026-03-27T12:00:00.000Z");
    const expiredCaseId = "expired-case";
    const freshCaseId = "fresh-case";
    const { db, state } = createCleanupDb({
      cases: [
        {
          id: expiredCaseId,
          createdAt: new Date("2026-03-26T11:59:59.000Z"),
          deceasedPersonId: "expired-person",
        },
        {
          id: freshCaseId,
          createdAt: new Date("2026-03-26T13:00:00.000Z"),
          deceasedPersonId: "fresh-person",
        },
      ],
      documents: [
        {
          id: "expired-document",
          caseId: expiredCaseId,
          r2Key: "expired/object.pdf",
        },
        {
          id: "fresh-document",
          caseId: freshCaseId,
          r2Key: "fresh/object.pdf",
        },
      ],
      persons: [
        {
          id: "expired-person",
          caseId: expiredCaseId,
          sourceDocumentId: "expired-document",
        },
        {
          id: "fresh-person",
          caseId: freshCaseId,
          sourceDocumentId: "fresh-document",
        },
      ],
      personEvents: [
        {
          id: "expired-event",
          documentId: "expired-document",
          personId: "expired-person",
        },
        {
          id: "fresh-event",
          documentId: "fresh-document",
          personId: "fresh-person",
        },
      ],
      relationships: [
        {
          id: "expired-relationship",
          caseId: expiredCaseId,
        },
        {
          id: "fresh-relationship",
          caseId: freshCaseId,
        },
      ],
      heirs: [
        {
          id: "expired-heir",
          caseId: expiredCaseId,
          personId: "expired-person",
        },
        {
          id: "fresh-heir",
          caseId: freshCaseId,
          personId: "fresh-person",
        },
      ],
    });
    const deleteObject = vi.fn(async () => undefined);

    const result = await cleanupExpiredCases({
      db,
      deleteObject,
      now,
    });

    expect(result.expiredCaseIds).toEqual([expiredCaseId]);
    expect(result.counts).toEqual({
      cases: 1,
      documents: 1,
      persons: 1,
      personEvents: 1,
      relationships: 1,
      heirs: 1,
      r2Objects: 1,
    });
    expect(result.failedObjectKeys).toEqual([]);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledWith("expired/object.pdf");
    expect(state.cases.map((entry) => entry.id)).toEqual([freshCaseId]);
    expect(state.documents.map((entry) => entry.id)).toEqual(["fresh-document"]);
    expect(state.persons.map((entry) => entry.id)).toEqual(["fresh-person"]);
    expect(state.personEvents.map((entry) => entry.id)).toEqual(["fresh-event"]);
    expect(state.relationships.map((entry) => entry.id)).toEqual([
      "fresh-relationship",
    ]);
    expect(state.heirs.map((entry) => entry.id)).toEqual(["fresh-heir"]);
  });

  it("期限切れがなければ何も削除しない", async () => {
    const now = new Date("2026-03-27T12:00:00.000Z");
    const { db, state } = createCleanupDb({
      cases: [
        {
          id: "fresh-case",
          createdAt: new Date("2026-03-27T00:30:00.000Z"),
          deceasedPersonId: "fresh-person",
        },
      ],
      documents: [
        {
          id: "fresh-document",
          caseId: "fresh-case",
          r2Key: "fresh/object.pdf",
        },
      ],
    });
    const deleteObject = vi.fn(async () => undefined);

    const result = await cleanupExpiredCases({
      db,
      deleteObject,
      now,
    });

    expect(result.expiredCaseIds).toEqual([]);
    expect(result.counts).toEqual({
      cases: 0,
      documents: 0,
      persons: 0,
      personEvents: 0,
      relationships: 0,
      heirs: 0,
      r2Objects: 0,
    });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(state.cases).toHaveLength(1);
    expect(state.documents).toHaveLength(1);
  });
});
