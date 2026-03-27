import type {
  KosekiField,
  OcrResult,
} from "../ocr/types";
import { normalizeAddress } from "./field-extractors/address";
import { convertWareki } from "./field-extractors/date";
import { parseEvent } from "./field-extractors/event";
import { extractName, normalizeNameText } from "./field-extractors/name";
import type { ParseResult, ParsedPerson } from "./types";
import { detectUnsupported } from "./unsupported-detector";

function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

type FieldEntry = {
  path: string;
  key: string;
  field: KosekiField;
};

function collectFieldEntries(ocrResult: OcrResult): FieldEntry[] {
  const entries: FieldEntry[] = [
    {
      path: "fields.headOfHousehold",
      key: "headOfHousehold",
      field: ocrResult.fields.headOfHousehold,
    },
    {
      path: "fields.registeredAddress",
      key: "registeredAddress",
      field: ocrResult.fields.registeredAddress,
    },
  ];

  ocrResult.fields.persons.forEach((person, personIndex) => {
    entries.push(
      {
        path: `fields.persons[${personIndex}].name`,
        key: "name",
        field: person.name,
      },
      {
        path: `fields.persons[${personIndex}].birthDate`,
        key: "birthDate",
        field: person.birthDate,
      },
    );

    if (person.relationship) {
      entries.push({
        path: `fields.persons[${personIndex}].relationship`,
        key: "relationship",
        field: person.relationship,
      });
    }

    if (person.deathDate) {
      entries.push({
        path: `fields.persons[${personIndex}].deathDate`,
        key: "deathDate",
        field: person.deathDate,
      });
    }

    if (person.gender) {
      entries.push({
        path: `fields.persons[${personIndex}].gender`,
        key: "gender",
        field: person.gender,
      });
    }

    if (person.address) {
      entries.push({
        path: `fields.persons[${personIndex}].address`,
        key: "address",
        field: person.address,
      });
    }

    person.events.forEach((event, eventIndex) => {
      entries.push(
        {
          path: `fields.persons[${personIndex}].events[${eventIndex}].date`,
          key: `${event.type}.date`,
          field: event.date,
        },
        {
          path: `fields.persons[${personIndex}].events[${eventIndex}].detail`,
          key: `${event.type}.detail`,
          field: event.detail,
        },
      );
    });
  });

  return entries;
}

function lowConfidenceWarning(entry: FieldEntry): string {
  return `Low confidence field "${entry.path}" (${entry.key}) detected: ${entry.field.confidence.toFixed(2)}.`;
}

export function parseKosekiOcrResult(ocrResult: OcrResult): ParseResult {
  const warnings = [
    ...ocrResult.warnings.map((warning) => warning.message),
    ...collectFieldEntries(ocrResult)
      .filter((entry) => entry.field.confidence < 0.5)
      .map(lowConfidenceWarning),
  ];

  const persons: ParsedPerson[] = ocrResult.fields.persons.map((person, index) => {
    const extractedName = extractName(person.name);
    const birthDate = convertWareki(person.birthDate.value) ?? undefined;
    const gender = person.gender ? normalizeText(person.gender.value) : undefined;
    const address = person.address
      ? normalizeAddress(person.address.value) || undefined
      : undefined;
    const relationshipLabel = person.relationship
      ? normalizeText(person.relationship.value) || undefined
      : undefined;
    const events = person.events.map(parseEvent);
    const deathDate =
      convertWareki(person.deathDate?.value ?? "") ??
      events.find((event) => event.type === "death")?.date;

    return {
      id: person.name.id ?? person.name.personId ?? `person-${index + 1}`,
      fullName: extractedName.fullName,
      fullNameKana: extractedName.fullNameKana || undefined,
      birthDate,
      deathDate,
      gender: gender || undefined,
      address,
      relationshipLabel,
      events,
    };
  });

  return {
    persons,
    documentType: normalizeText(ocrResult.documentType ?? ""),
    headOfHousehold: normalizeNameText(ocrResult.fields.headOfHousehold.value) || undefined,
    registeredAddress:
      normalizeAddress(ocrResult.fields.registeredAddress.value) || undefined,
    warnings,
    unsupportedReasons: detectUnsupported(ocrResult),
  };
}
