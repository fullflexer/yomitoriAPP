import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getCaseAggregate, getCasesDb } from "@/lib/cases/repository";
import { jsonError, parseBoolean } from "@/lib/http";
import { runOcrPipeline } from "@/lib/ocr/pipeline";
import { enqueueOcrJob } from "@/lib/queue/jobs/ocr-job";
import { deleteUploadObject, uploadUploadObject } from "@/lib/storage/r2-client";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
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
  const formData = await request.formData();
  const consent = parseBoolean(formData.get("consent"));

  if (!consent) {
    return jsonError(
      "OCR と Claude Vision API を利用するには同意が必要です。",
      400,
      { code: "consent_required" },
    );
  }

  const file = formData.get("file");
  const documentType = formData.get("documentType");

  if (!(file instanceof File)) {
    return jsonError("アップロードするファイルが必要です。", 400);
  }

  const aggregate = await getCaseAggregate(id);
  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const r2Key = [
    "cases",
    id,
    "documents",
    `${randomUUID()}-${sanitizeFilename(file.name || "upload.bin")}`,
  ].join("/");

  await uploadUploadObject({
    key: r2Key,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  try {
    const created = await getCasesDb().document.create({
      data: {
        caseId: id,
        r2Key,
        originalFilename: file.name || "upload.bin",
        documentType:
          typeof documentType === "string" && documentType.trim()
            ? documentType.trim()
            : "unknown",
        status: "queued",
        ocrResult: {},
      },
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
