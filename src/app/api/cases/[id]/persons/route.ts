import { NextResponse } from "next/server";

import { caseExists, listCasePersons } from "@/lib/cases/repository";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function toIsoDate(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const exists = await caseExists(id);

  if (!exists) {
    return jsonError("ケースが見つかりません。", 404);
  }

  const persons = await listCasePersons(id);

  return NextResponse.json(
    persons.map((person) => ({
      id: String(person.id),
      fullName: String(person.fullName ?? ""),
      birthDate: toIsoDate(person.birthDate),
      deathDate: toIsoDate(person.deathDate),
      gender: person.gender ?? null,
      address: person.address ?? null,
      sourceDocumentId: String(person.sourceDocumentId ?? ""),
      personEvents: Array.isArray(person.personEvents)
        ? person.personEvents.map((event) => ({
            id: String(event.id),
            eventType: String(event.eventType ?? ""),
            eventDate: toIsoDate(event.eventDate),
            eventDateRaw: event.eventDateRaw ?? null,
            counterpartPersonId: event.counterpartPersonId ?? null,
            rawText: event.rawText ?? null,
            confidence: event.confidence ?? null,
          }))
        : [],
    })),
  );
}
