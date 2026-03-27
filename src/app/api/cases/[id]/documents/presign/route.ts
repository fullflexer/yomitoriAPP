import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getCaseAggregate } from "@/lib/cases/repository";
import { jsonError, parseJsonBody } from "@/lib/http";
import { generatePresignedPutUrl } from "@/lib/storage/r2-client";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PresignBody = {
  filename?: string;
  contentType?: string;
  consent?: boolean;
};

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized.length > 0 ? normalized : "upload.bin";
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await parseJsonBody<PresignBody>(request);

  if (body.consent !== true) {
    return jsonError(
      "OCR 処理を利用するには同意が必要です。",
      400,
      { code: "consent_required" },
    );
  }

  const filename = sanitizeText(body.filename);
  const contentType = sanitizeText(body.contentType);

  if (!filename) {
    return jsonError("filename は必須です。", 400);
  }

  if (!contentType) {
    return jsonError("contentType は必須です。", 400);
  }

  const aggregate = await getCaseAggregate(id);
  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  const r2Key = [
    "cases",
    id,
    "documents",
    `${randomUUID()}-${sanitizeFilename(filename)}`,
  ].join("/");

  const uploadUrl = await generatePresignedPutUrl(r2Key, contentType);

  return NextResponse.json({
    uploadUrl,
    r2Key,
  });
}
