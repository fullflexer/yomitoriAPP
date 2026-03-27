import { NextResponse } from "next/server";

import { createDocument, getCaseAggregate } from "@/lib/cases/repository";
import { jsonError, parseJsonBody } from "@/lib/http";
import { runOcrPipeline } from "@/lib/ocr/pipeline";
import { enqueueOcrJob } from "@/lib/queue/jobs/ocr-job";
import { deleteUploadObject } from "@/lib/storage/r2-client";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CreateDocumentBody = {
  r2Key?: string;
  originalFilename?: string;
  documentType?: string;
  consent?: boolean;
};

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCaseDocumentKey(caseId: string, r2Key: string) {
  return r2Key.startsWith(`cases/${caseId}/documents/`);
}

function serializeDocument(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    caseId: String(row.caseId),
    originalFilename: String(row.originalFilename ?? ""),
    documentType: String(row.documentType ?? "unknown"),
    status: String(row.status ?? "queued"),
    requiresReview: Boolean(row.requiresReview),
    reviewReason: Array.isArray(row.reviewReason)
      ? row.reviewReason.map((value) => String(value))
      : [],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

async function maybeRunOcrInline(documentId: string) {
  if (
    process.env.OCR_PROVIDER === "mock" &&
    process.env.OCR_EXECUTION_MODE === "inline"
  ) {
    await runOcrPipeline(documentId);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const aggregate = await getCaseAggregate(id);

  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  return NextResponse.json(
    aggregate.documents.map((document) => ({
      id: document.id,
      originalFilename: document.originalFilename,
      documentType: document.documentType,
      status: document.status,
      createdAt:
        document.createdAt instanceof Date
          ? document.createdAt.toISOString()
          : document.createdAt ?? null,
      requiresReview: document.requiresReview ?? false,
      reviewReason: document.reviewReason ?? [],
    })),
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await parseJsonBody<CreateDocumentBody>(request);

  if (body.consent !== true) {
    return jsonError(
      "OCR 処理を利用するには同意が必要です。",
      400,
      { code: "consent_required" },
    );
  }

  const r2Key = sanitizeText(body.r2Key);
  const originalFilename = sanitizeText(body.originalFilename);
  const documentType = sanitizeText(body.documentType);

  if (!r2Key) {
    return jsonError("r2Key は必須です。", 400);
  }

  if (!originalFilename) {
    return jsonError("originalFilename は必須です。", 400);
  }

  if (!documentType) {
    return jsonError("documentType は必須です。", 400);
  }

  const aggregate = await getCaseAggregate(id);
  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  if (!isCaseDocumentKey(id, r2Key)) {
    return jsonError("不正なアップロードキーです。", 400);
  }

  try {
    const created = await createDocument({
      caseId: id,
      r2Key,
      originalFilename,
      documentType,
      status: "queued",
      ocrResult: {},
    });

    await enqueueOcrJob({
      documentId: String(created.id),
      caseId: id,
    });
    await maybeRunOcrInline(String(created.id));

    return NextResponse.json(serializeDocument(created), { status: 201 });
  } catch (error) {
    await deleteUploadObject(r2Key).catch(() => undefined);
    throw error;
  }
}
