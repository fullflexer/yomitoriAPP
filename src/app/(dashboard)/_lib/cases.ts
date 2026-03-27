import {
  getCaseAggregate,
  listCases,
} from "@/lib/cases/repository";
import {
  buildDiagramInputFromAggregate,
  type WorkflowCaseAggregate,
  type WorkflowCaseDocument,
  type WorkflowCaseHeir,
  type WorkflowCasePerson,
  type WorkflowCaseRelationship,
} from "@/lib/cases/workflow";
import type { DiagramInput } from "@/lib/diagram/types";

export type CaseListItem = {
  id: string;
  title: string;
  status: string;
  matchingStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
  counts: {
    documents: number;
    persons: number;
    heirs: number;
  };
};

export type CaseDocumentItem = WorkflowCaseDocument;

export type CasePersonItem = WorkflowCasePerson & {
  sourceDocument: {
    id: string;
    originalFilename: string;
  };
};

export type CaseRelationshipItem = WorkflowCaseRelationship;

export type CaseHeirItem = WorkflowCaseHeir;

export type CaseDetailItem = {
  id: string;
  title: string;
  status: string;
  matchingStatus: string;
  inheritanceResult: unknown;
  deceasedPersonId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  documents: CaseDocumentItem[];
  persons: CasePersonItem[];
  relationships: CaseRelationshipItem[];
  heirs: CaseHeirItem[];
  deceasedPerson: CasePersonItem | null;
};

function toDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function attachSourceDocument(
  aggregate: WorkflowCaseAggregate,
  person: WorkflowCasePerson,
): CasePersonItem {
  const sourceDocument = aggregate.documents.find(
    (document) => document.id === person.sourceDocumentId,
  );

  return {
    ...person,
    sourceDocument: {
      id: sourceDocument?.id ?? person.sourceDocumentId,
      originalFilename: sourceDocument?.originalFilename ?? "不明な文書",
    },
  };
}

function toCaseDetail(aggregate: WorkflowCaseAggregate): CaseDetailItem {
  const persons = aggregate.persons.map((person) => attachSourceDocument(aggregate, person));
  const deceasedPerson =
    persons.find((person) => person.id === aggregate.deceasedPersonId) ?? null;

  return {
    id: aggregate.id,
    title: aggregate.title,
    status: aggregate.status,
    matchingStatus: aggregate.matchingStatus ?? "pending",
    inheritanceResult: aggregate.inheritanceResult ?? null,
    deceasedPersonId: aggregate.deceasedPersonId ?? null,
    createdAt: toDateTime(aggregate.createdAt),
    updatedAt: toDateTime(aggregate.updatedAt),
    documents: aggregate.documents,
    persons,
    relationships: aggregate.relationships,
    heirs: aggregate.heirs,
    deceasedPerson,
  };
}

export async function getCaseList(): Promise<CaseListItem[]> {
  const rows = await listCases();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    matchingStatus: row.matchingStatus ?? "pending",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
    counts: {
      documents: row.documentCount,
      persons: row.personCount,
      heirs: row.heirCount,
    },
  }));
}

export async function getCaseDetail(caseId: string): Promise<CaseDetailItem | null> {
  const aggregate = await getCaseAggregate(caseId);
  return aggregate ? toCaseDetail(aggregate) : null;
}

export function buildDiagramInput(caseRecord: CaseDetailItem): DiagramInput {
  const aggregate: WorkflowCaseAggregate = {
    id: caseRecord.id,
    title: caseRecord.title,
    status: caseRecord.status,
    matchingStatus: caseRecord.matchingStatus,
    deceasedPersonId: caseRecord.deceasedPersonId,
    inheritanceResult: caseRecord.inheritanceResult,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    documents: caseRecord.documents,
    persons: caseRecord.persons,
    relationships: caseRecord.relationships,
    heirs: caseRecord.heirs,
  };

  return buildDiagramInputFromAggregate(aggregate).input;
}
