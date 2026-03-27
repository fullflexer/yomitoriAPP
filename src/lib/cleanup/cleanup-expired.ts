type CleanupDeleteManyResult = {
  count: number;
};

type ExpiredDocumentRecord = {
  id: string;
  r2Key: string;
};

type ExpiredCaseRecord = {
  id: string;
  documents: ExpiredDocumentRecord[];
};

type CleanupWhereInClause = {
  in: string[];
};

type CleanupExpiredTransactionClient = {
  case: {
    updateMany(args: {
      where: { id: CleanupWhereInClause };
      data: { deceasedPersonId: null };
    }): Promise<CleanupDeleteManyResult>;
    deleteMany(args: {
      where: { id: CleanupWhereInClause };
    }): Promise<CleanupDeleteManyResult>;
  };
  personEvent: {
    deleteMany(args: {
      where: { documentId: CleanupWhereInClause };
    }): Promise<CleanupDeleteManyResult>;
  };
  heir: {
    deleteMany(args: {
      where: { caseId: CleanupWhereInClause };
    }): Promise<CleanupDeleteManyResult>;
  };
  relationship: {
    deleteMany(args: {
      where: { caseId: CleanupWhereInClause };
    }): Promise<CleanupDeleteManyResult>;
  };
  person: {
    deleteMany(args: {
      where: { caseId: CleanupWhereInClause };
    }): Promise<CleanupDeleteManyResult>;
  };
  document: {
    deleteMany(args: {
      where: { caseId: CleanupWhereInClause };
    }): Promise<CleanupDeleteManyResult>;
  };
};

export type CleanupExpiredPrisma = CleanupExpiredTransactionClient & {
  case: CleanupExpiredTransactionClient["case"] & {
    findMany(args: {
      where: { createdAt: { lte: Date } };
      select: {
        id: true;
        documents: {
          select: {
            id: true;
            r2Key: true;
          };
        };
      };
    }): Promise<ExpiredCaseRecord[]>;
  };
  $transaction<T>(
    callback: (tx: CleanupExpiredTransactionClient) => Promise<T>,
  ): Promise<T>;
};

export type CleanupExpiredCounts = {
  cases: number;
  documents: number;
  persons: number;
  personEvents: number;
  relationships: number;
  heirs: number;
  r2Objects: number;
};

export type CleanupExpiredResult = {
  cutoff: Date;
  expiredCaseIds: string[];
  counts: CleanupExpiredCounts;
  failedObjectKeys: string[];
};

type CleanupExpiredOptions = {
  prisma: CleanupExpiredPrisma;
  deleteObject?: (key: string) => Promise<void>;
  now?: Date;
  cutoffHours?: number;
};

const DEFAULT_CUTOFF_HOURS = 24;

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
  prisma,
  deleteObject = async () => {},
  now = new Date(),
  cutoffHours = DEFAULT_CUTOFF_HOURS,
}: CleanupExpiredOptions): Promise<CleanupExpiredResult> {
  const cutoff = getCutoff(now, cutoffHours);
  const expiredCases = await prisma.case.findMany({
    where: {
      createdAt: {
        lte: cutoff,
      },
    },
    select: {
      id: true,
      documents: {
        select: {
          id: true,
          r2Key: true,
        },
      },
    },
  });

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

  const counts = await prisma.$transaction(async (tx) => {
    const personEvents = documentIds.length
      ? await tx.personEvent.deleteMany({
          where: {
            documentId: {
              in: documentIds,
            },
          },
        })
      : { count: 0 };

    await tx.case.updateMany({
      where: {
        id: {
          in: caseIds,
        },
      },
      data: {
        deceasedPersonId: null,
      },
    });

    const heirs = await tx.heir.deleteMany({
      where: {
        caseId: {
          in: caseIds,
        },
      },
    });

    const relationships = await tx.relationship.deleteMany({
      where: {
        caseId: {
          in: caseIds,
        },
      },
    });

    const persons = await tx.person.deleteMany({
      where: {
        caseId: {
          in: caseIds,
        },
      },
    });

    const documents = await tx.document.deleteMany({
      where: {
        caseId: {
          in: caseIds,
        },
      },
    });

    const cases = await tx.case.deleteMany({
      where: {
        id: {
          in: caseIds,
        },
      },
    });

    return {
      cases: cases.count,
      documents: documents.count,
      persons: persons.count,
      personEvents: personEvents.count,
      relationships: relationships.count,
      heirs: heirs.count,
      r2Objects: 0,
    };
  });

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
    `r2ObjectsFailed=${result.failedObjectKeys.length}`,
  ].join("\n");
}
