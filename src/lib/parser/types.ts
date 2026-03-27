export type ParsedEventType =
  | "birth"
  | "death"
  | "marriage"
  | "divorce"
  | "adoption"
  | "disadoption"
  | "recognition"
  | "transfer"
  | "other";

export interface ParsedEvent {
  type: ParsedEventType;
  date?: string;
  dateRaw?: string;
  detail?: string;
  counterpartName?: string;
  confidence: number;
}

export interface ParsedPerson {
  id: string;
  fullName: string;
  fullNameKana?: string;
  birthDate?: string;
  deathDate?: string;
  gender?: string;
  address?: string;
  relationshipLabel?: string;
  events: ParsedEvent[];
}

export interface ParseResult {
  persons: ParsedPerson[];
  documentType: string;
  headOfHousehold?: string;
  registeredAddress?: string;
  warnings: string[];
  unsupportedReasons: string[];
}
