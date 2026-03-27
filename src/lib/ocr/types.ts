export type DocumentType =
  | "computerized_koseki"
  | "original_koseki"
  | "removed_koseki"
  | "unknown";

export type OcrInput = {
  imageBuffer: Buffer;
  mimeType: string;
  documentType: DocumentType;
};

export type KosekiField = {
  value: string;
  confidence: number;
  rawText?: string;
  id?: string;
  key?: string;
  personId?: string;
  label?: string;
  page?: number;
};

export type KosekiEventField = {
  type: string;
  date: KosekiField;
  detail: KosekiField;
  eventTypeHint?: string;
  counterpartName?: string;
};

export type KosekiPersonField = {
  name: KosekiField;
  relationship?: KosekiField;
  birthDate: KosekiField;
  deathDate?: KosekiField;
  gender?: KosekiField;
  address?: KosekiField;
  events: KosekiEventField[];
};

export type KosekiFields = {
  headOfHousehold: KosekiField;
  registeredAddress: KosekiField;
  persons: KosekiPersonField[];
};

export type OcrWarning = {
  code: string;
  message: string;
  field?: string;
};

export type OcrResult = {
  rawText: string;
  fields: KosekiFields;
  confidence: number;
  warnings: OcrWarning[];
  tokensUsed?: number;
  processingTimeMs: number;
  documentType?: DocumentType;
};

export interface OcrProvider {
  extract(input: OcrInput): Promise<OcrResult>;
}
