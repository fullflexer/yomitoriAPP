import { describe, expect, it, vi } from "vitest";

import {
  cleanupExpiredCases,
  type CleanupExpiredPrisma,
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

function createCleanupPrisma(seed?: {
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

  const prisma: CleanupExpiredPrisma = {
    case: {
      async findMany(args) {
        return state.cases
          .filter((entry) => entry.createdAt <= args.where.createdAt.lte)
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
      async updateMany(args) {
        const caseIdSet = new Set(args.where.id.in);
        let count = 0;

        state.cases = state.cases.map((entry) => {
          if (!caseIdSet.has(entry.id)) {
            return entry;
          }

          count += 1;
          return {
            ...entry,
            deceasedPersonId: args.data.deceasedPersonId,
          };
        });

        return { count };
      },
      async deleteMany(args) {
        const removal = removeByIds(state.cases, args.where.id.in);
        state.cases = removal.items;
        return { count: removal.count };
      },
    },
    personEvent: {
      async deleteMany(args) {
        const removal = removeByDocumentIds(
          state.personEvents,
          args.where.documentId.in,
        );
        state.personEvents = removal.items;
        return { count: removal.count };
      },
    },
    heir: {
      async deleteMany(args) {
        const removal = removeByCaseIds(state.heirs, args.where.caseId.in);
        state.heirs = removal.items;
        return { count: removal.count };
      },
    },
    relationship: {
      async deleteMany(args) {
        const removal = removeByCaseIds(
          state.relationships,
          args.where.caseId.in,
        );
        state.relationships = removal.items;
        return { count: removal.count };
      },
    },
    person: {
      async deleteMany(args) {
        const removal = removeByCaseIds(state.persons, args.where.caseId.in);
        state.persons = removal.items;
        return { count: removal.count };
      },
    },
    document: {
      async deleteMany(args) {
        const removal = removeByCaseIds(state.documents, args.where.caseId.in);
        state.documents = removal.items;
        return { count: removal.count };
      },
    },
    async $transaction(callback) {
      return callback({
        case: prisma.case,
        personEvent: prisma.personEvent,
        heir: prisma.heir,
        relationship: prisma.relationship,
        person: prisma.person,
        document: prisma.document,
      });
    },
  };

  return { prisma, state };
}

describe("cleanupExpiredCases", () => {
  it("24時間超過の案件と関連データを削除し、24時間以内は残す", async () => {
    const now = new Date("2026-03-27T12:00:00.000Z");
    const expiredCaseId = "expired-case";
    const freshCaseId = "fresh-case";
    const { prisma, state } = createCleanupPrisma({
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
      prisma,
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
    const { prisma, state } = createCleanupPrisma({
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
      prisma,
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
