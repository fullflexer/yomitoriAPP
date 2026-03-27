import { determineHeirs } from "@/lib/inheritance/engine";
import type { FamilyGraph, Gender, InheritanceResult } from "@/lib/inheritance/types";
import { calculateLayout } from "@/lib/diagram/layout-engine";
import { renderToPdf } from "@/lib/diagram/pdf-renderer";
import { renderToSvg } from "@/lib/diagram/svg-renderer";
import type { DiagramInput, DiagramPerson, DiagramRelationship } from "@/lib/diagram/types";

type TimestampLike = Date | string | null | undefined;

export type WorkflowCasePerson = {
  id: string;
  fullName: string;
  fullNameKana?: string | null;
  birthDate?: TimestampLike;
  deathDate?: TimestampLike;
  gender?: string | null;
  address?: string | null;
  canonicalPersonId?: string | null;
  mergeConfidence?: number | string | null;
  sourceDocumentId: string;
};

export type WorkflowCaseDocument = {
  id: string;
  originalFilename: string;
  documentType: string;
  status: string;
  r2Key: string;
  createdAt?: TimestampLike;
  requiresReview?: boolean;
  reviewReason?: string[];
  ocrConfidence?: number | string | null;
  tokensUsed?: number | null;
  estimatedCostUsd?: number | string | null;
  ocrResult: unknown;
};

export type WorkflowCaseRelationship = {
  id?: string;
  fromPersonId: string;
  toPersonId: string;
  relationType: string;
  source?: string;
  confidence?: number | string | null;
};

export type WorkflowCaseHeir = {
  id?: string;
  personId: string;
  heirClass: string;
  shareNumerator: number;
  shareDenominator: number;
  status: string;
};

type ParsedPersonSnapshot = {
  fullName: string;
  birthDate?: string;
  deathDate?: string;
  address?: string;
  relationshipLabel?: string;
  events?: Array<{
    type?: string;
    counterpartName?: string;
  }>;
};

type ParsedDocumentSnapshot = {
  headOfHousehold?: string;
  registeredAddress?: string;
  persons: ParsedPersonSnapshot[];
};

type RelationshipSeed = {
  fromPersonId: string;
  toPersonId: string;
  relationType: "spouse" | "parent";
};

export type DerivedWorkflowState = {
  deceasedPersonId: string | null;
  relationships: WorkflowCaseRelationship[];
  relationshipSources: string[];
  parsedDocuments: ParsedDocumentSnapshot[];
};

export type WorkflowCaseAggregate = {
  id: string;
  title: string;
  status: string;
  matchingStatus?: string;
  deceasedPersonId?: string | null;
  inheritanceResult?: unknown;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  persons: WorkflowCasePerson[];
  documents: WorkflowCaseDocument[];
  relationships: WorkflowCaseRelationship[];
  heirs: WorkflowCaseHeir[];
};

export type PreparedInheritanceResult = {
  inheritance: InheritanceResult;
  deceasedPersonId: string;
  relationships: WorkflowCaseRelationship[];
  relationshipSources: string[];
};

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function dateToIsoDate(value: TimestampLike): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function dateToIsoDateTime(value: TimestampLike): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function parseGender(value?: string | null): Gender | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "男" || /^male$/i.test(value)) {
    return "male";
  }

  if (value === "女" || /^female$/i.test(value)) {
    return "female";
  }

  return "other";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getParsedDocumentSnapshot(document: WorkflowCaseDocument): ParsedDocumentSnapshot | null {
  if (!isObject(document.ocrResult)) {
    return null;
  }

  const parsed = document.ocrResult.parsed;
  if (!isObject(parsed) || !Array.isArray(parsed.persons)) {
    return null;
  }

  const persons = parsed.persons
    .filter(isObject)
    .map((person) => ({
      fullName: typeof person.fullName === "string" ? person.fullName : "",
      birthDate: typeof person.birthDate === "string" ? person.birthDate : undefined,
      deathDate: typeof person.deathDate === "string" ? person.deathDate : undefined,
      address: typeof person.address === "string" ? person.address : undefined,
      relationshipLabel:
        typeof person.relationshipLabel === "string" ? person.relationshipLabel : undefined,
      events: Array.isArray(person.events)
        ? person.events.filter(isObject).map((event) => ({
            type: typeof event.type === "string" ? event.type : undefined,
            counterpartName:
              typeof event.counterpartName === "string"
                ? event.counterpartName
                : undefined,
          }))
        : [],
    }))
    .filter((person) => person.fullName.length > 0);

  return {
    headOfHousehold:
      typeof parsed.headOfHousehold === "string" ? parsed.headOfHousehold : undefined,
    registeredAddress:
      typeof parsed.registeredAddress === "string"
        ? parsed.registeredAddress
        : undefined,
    persons,
  };
}

function dedupeRelationships(entries: RelationshipSeed[]): WorkflowCaseRelationship[] {
  const seen = new Set<string>();
  const relationships: WorkflowCaseRelationship[] = [];

  for (const entry of entries) {
    if (entry.fromPersonId === entry.toPersonId) {
      continue;
    }

    const key =
      entry.relationType === "spouse"
        ? [
            entry.relationType,
            ...[entry.fromPersonId, entry.toPersonId].sort(),
          ].join(":")
        : [entry.relationType, entry.fromPersonId, entry.toPersonId].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    relationships.push(entry);
  }

  return relationships;
}

function resolveDeceasedPersonId(
  aggregate: WorkflowCaseAggregate,
  parsedDocuments: ParsedDocumentSnapshot[],
): string | null {
  const peopleById = new Map(aggregate.persons.map((person) => [person.id, person]));
  if (aggregate.deceasedPersonId && peopleById.has(aggregate.deceasedPersonId)) {
    return aggregate.deceasedPersonId;
  }

  const byName = new Map<string, WorkflowCasePerson[]>();
  for (const person of aggregate.persons) {
    const key = normalizeName(person.fullName);
    const current = byName.get(key) ?? [];
    current.push(person);
    byName.set(key, current);
  }

  for (const parsed of parsedDocuments) {
    const head = parsed.headOfHousehold ? normalizeName(parsed.headOfHousehold) : "";
    if (!head) {
      continue;
    }

    const matched = (byName.get(head) ?? []).find((person) => Boolean(person.deathDate));
    if (matched) {
      return matched.id;
    }
  }

  const deceasedPeople = aggregate.persons.filter((person) => Boolean(person.deathDate));
  if (deceasedPeople.length === 1) {
    return deceasedPeople[0].id;
  }

  for (const parsed of parsedDocuments) {
    const head = parsed.headOfHousehold ? normalizeName(parsed.headOfHousehold) : "";
    if (!head) {
      continue;
    }

    const matched = (byName.get(head) ?? [])[0];
    if (matched) {
      return matched.id;
    }
  }

  return aggregate.persons[0]?.id ?? null;
}

function isSpouseLabel(label: string) {
  return /配偶者|妻|夫/.test(label);
}

function isChildLabel(label: string) {
  return /長男|次男|三男|四男|五男|六男|七男|八男|九男|長女|次女|三女|四女|五女|六女|七女|八女|九女|子|養子|養女/.test(
    label,
  );
}

export function deriveWorkflowState(aggregate: WorkflowCaseAggregate): DerivedWorkflowState {
  const parsedDocuments = aggregate.documents
    .map(getParsedDocumentSnapshot)
    .filter((value): value is ParsedDocumentSnapshot => value !== null);
  const deceasedPersonId = resolveDeceasedPersonId(aggregate, parsedDocuments);

  if (!deceasedPersonId) {
    return {
      deceasedPersonId: null,
      relationships: aggregate.relationships,
      relationshipSources: [],
      parsedDocuments,
    };
  }

  const relationships: RelationshipSeed[] = aggregate.relationships
    .filter(
      (relationship): relationship is RelationshipSeed =>
        relationship.relationType === "spouse" || relationship.relationType === "parent",
    )
    .map((relationship) => ({
      fromPersonId: relationship.fromPersonId,
      toPersonId: relationship.toPersonId,
      relationType: relationship.relationType,
    }));
  const sources = new Set<string>();
  const peopleByName = new Map<string, WorkflowCasePerson[]>();

  for (const person of aggregate.persons) {
    const key = normalizeName(person.fullName);
    const current = peopleByName.get(key) ?? [];
    current.push(person);
    peopleByName.set(key, current);
  }

  for (const parsed of parsedDocuments) {
    for (const parsedPerson of parsed.persons) {
      const matched = (peopleByName.get(normalizeName(parsedPerson.fullName)) ?? [])[0];
      if (!matched || matched.id === deceasedPersonId) {
        continue;
      }

      if (parsedPerson.relationshipLabel && isSpouseLabel(parsedPerson.relationshipLabel)) {
        relationships.push({
          fromPersonId: deceasedPersonId,
          toPersonId: matched.id,
          relationType: "spouse",
        });
        sources.add("relationshipLabel:spouse");
      }

      if (parsedPerson.relationshipLabel && isChildLabel(parsedPerson.relationshipLabel)) {
        relationships.push({
          fromPersonId: deceasedPersonId,
          toPersonId: matched.id,
          relationType: "parent",
        });
        sources.add("relationshipLabel:child");
      }

      for (const event of parsedPerson.events ?? []) {
        if (event.type !== "marriage" || !event.counterpartName) {
          continue;
        }

        const counterpart = (peopleByName.get(normalizeName(event.counterpartName)) ?? [])[0];
        if (!counterpart) {
          continue;
        }

        relationships.push({
          fromPersonId: matched.id,
          toPersonId: counterpart.id,
          relationType: "spouse",
        });
        sources.add("event:marriage");
      }
    }
  }

  return {
    deceasedPersonId,
    relationships: dedupeRelationships(relationships),
    relationshipSources: [...sources],
    parsedDocuments,
  };
}

export function prepareInheritance(aggregate: WorkflowCaseAggregate): PreparedInheritanceResult {
  const derived = deriveWorkflowState(aggregate);

  if (!derived.deceasedPersonId) {
    throw new Error("相続判定を行うには少なくとも1人の被相続人候補が必要です。");
  }

  const graph: FamilyGraph = {
    persons: aggregate.persons.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      birthDate: dateToIsoDate(person.birthDate),
      deathDate: dateToIsoDate(person.deathDate),
      gender: parseGender(person.gender),
    })),
    relationships: derived.relationships.map((relationship) =>
      relationship.relationType === "parent"
        ? {
            fromPersonId: relationship.fromPersonId,
            toPersonId: relationship.toPersonId,
            relationType: "parent",
          }
        : {
            fromPersonId: relationship.fromPersonId,
            toPersonId: relationship.toPersonId,
            relationType: "spouse",
          },
    ),
  };

  return {
    inheritance: determineHeirs(graph, derived.deceasedPersonId),
    deceasedPersonId: derived.deceasedPersonId,
    relationships: derived.relationships,
    relationshipSources: derived.relationshipSources,
  };
}

function getRegisteredAddress(parsedDocuments: ParsedDocumentSnapshot[]) {
  return parsedDocuments.find((document) => document.registeredAddress)?.registeredAddress;
}

export function buildDiagramInputFromAggregate(aggregate: WorkflowCaseAggregate) {
  const derived = deriveWorkflowState(aggregate);

  if (!derived.deceasedPersonId) {
    throw new Error("図面生成に必要な被相続人が解決できませんでした。");
  }

  const heirIds = new Set(aggregate.heirs.map((heir) => heir.personId));
  const registeredAddress = getRegisteredAddress(derived.parsedDocuments);
  const diagramRelationships: DiagramRelationship[] = [];
  const seenEdges = new Set<string>();

  for (const relationship of derived.relationships) {
    if (relationship.relationType === "spouse") {
      const [left, right] = [relationship.fromPersonId, relationship.toPersonId].sort();
      const key = `marriage:${left}:${right}`;
      if (seenEdges.has(key)) {
        continue;
      }

      seenEdges.add(key);
      diagramRelationships.push({
        from: left,
        to: right,
        type: "marriage",
      });
      continue;
    }

    const key = `parent-child:${relationship.fromPersonId}:${relationship.toPersonId}`;
    if (seenEdges.has(key)) {
      continue;
    }

    seenEdges.add(key);
    diagramRelationships.push({
      from: relationship.fromPersonId,
      to: relationship.toPersonId,
      type: "parent-child",
    });
  }

  const diagramPersons: DiagramPerson[] = aggregate.persons.map((person) => ({
    id: person.id,
    name: person.fullName,
    birthDate: dateToIsoDate(person.birthDate),
    deathDate: dateToIsoDate(person.deathDate),
    isDeceased: Boolean(person.deathDate),
    role:
      person.id === derived.deceasedPersonId
        ? "deceased"
        : derived.relationships.some(
              (relationship) =>
                relationship.relationType === "spouse" &&
                ((relationship.fromPersonId === derived.deceasedPersonId &&
                  relationship.toPersonId === person.id) ||
                  (relationship.toPersonId === derived.deceasedPersonId &&
                    relationship.fromPersonId === person.id)),
            )
          ? "spouse"
          : heirIds.has(person.id)
            ? "heir"
            : "other",
    domicile: person.id === derived.deceasedPersonId ? registeredAddress : undefined,
    lastAddress: person.address ?? undefined,
    address: person.address ?? undefined,
  }));

  return {
    derived,
    input: {
      persons: diagramPersons,
      relationships: diagramRelationships,
      title: `${aggregate.title} 相続関係図`,
    } satisfies DiagramInput,
  };
}

export async function buildDiagramArtifacts(aggregate: WorkflowCaseAggregate) {
  const { input } = buildDiagramInputFromAggregate(aggregate);
  const diagramInput: DiagramInput = {
    persons: input.persons,
    relationships: input.relationships,
    title: input.title,
  };
  const layout = await calculateLayout(diagramInput);
  const svg = renderToSvg(layout, diagramInput.title);
  const pdf = await renderToPdf(svg);

  return {
    input: diagramInput,
    layout,
    svg,
    pdf,
    generatedAt: new Date().toISOString(),
  };
}

export function serializeCaseAggregate(aggregate: WorkflowCaseAggregate) {
  return {
    id: aggregate.id,
    title: aggregate.title,
    status: aggregate.status,
    matchingStatus: aggregate.matchingStatus ?? null,
    deceasedPersonId: aggregate.deceasedPersonId ?? null,
    inheritanceResult: aggregate.inheritanceResult ?? null,
    createdAt: dateToIsoDateTime(aggregate.createdAt) ?? null,
    updatedAt: dateToIsoDateTime(aggregate.updatedAt) ?? null,
    documents: aggregate.documents.map((document) => ({
      id: document.id,
      originalFilename: document.originalFilename,
      documentType: document.documentType,
      status: document.status,
      r2Key: document.r2Key,
      createdAt: dateToIsoDateTime(document.createdAt) ?? null,
      requiresReview: document.requiresReview ?? false,
      reviewReason: document.reviewReason ?? [],
      ocrConfidence: document.ocrConfidence ?? null,
      tokensUsed: document.tokensUsed ?? null,
      estimatedCostUsd: document.estimatedCostUsd ?? null,
    })),
    persons: aggregate.persons.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      fullNameKana: person.fullNameKana ?? null,
      birthDate: dateToIsoDate(person.birthDate) ?? null,
      deathDate: dateToIsoDate(person.deathDate) ?? null,
      gender: person.gender ?? null,
      address: person.address ?? null,
      canonicalPersonId: person.canonicalPersonId ?? null,
      mergeConfidence: person.mergeConfidence ?? null,
      sourceDocumentId: person.sourceDocumentId,
    })),
    relationships: aggregate.relationships,
    heirs: aggregate.heirs,
  };
}
