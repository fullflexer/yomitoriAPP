import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getCaseAggregate, getCasesDb } from "@/lib/cases/repository";
import { buildDiagramArtifacts } from "@/lib/cases/workflow";
import { jsonError } from "@/lib/http";
import {
  createPresignedDownloadUrl,
  uploadUploadObject,
} from "@/lib/storage/r2-client";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getDiagramMetadata(inheritanceResult: unknown) {
  if (!isObject(inheritanceResult) || !isObject(inheritanceResult.diagram)) {
    return null;
  }

  const diagram = inheritanceResult.diagram;
  if (typeof diagram.pdfKey !== "string") {
    return null;
  }

  return {
    pdfKey: diagram.pdfKey,
    svgKey: typeof diagram.svgKey === "string" ? diagram.svgKey : null,
    generatedAt: typeof diagram.generatedAt === "string" ? diagram.generatedAt : null,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const aggregate = await getCaseAggregate(id);

  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  const diagram = getDiagramMetadata(aggregate.inheritanceResult);
  if (!diagram) {
    return jsonError("PDF 図面がまだ生成されていません。", 404);
  }

  const url = await createPresignedDownloadUrl({
    key: diagram.pdfKey,
    expiresIn: 60 * 10,
  });

  return NextResponse.json({
    url,
    generatedAt: diagram.generatedAt,
  });
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const aggregate = await getCaseAggregate(id);

  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  if (aggregate.persons.length === 0) {
    return jsonError("図面生成の前に人物解析が必要です。", 409);
  }

  const artifacts = await buildDiagramArtifacts(aggregate);
  const baseKey = ["cases", id, "diagram", randomUUID()].join("/");
  const svgKey = `${baseKey}.svg`;
  const pdfKey = `${baseKey}.pdf`;

  await uploadUploadObject({
    key: svgKey,
    body: artifacts.svg,
    contentType: "image/svg+xml",
  });
  await uploadUploadObject({
    key: pdfKey,
    body: artifacts.pdf,
    contentType: "application/pdf",
  });

  const previousResult = isObject(aggregate.inheritanceResult)
    ? aggregate.inheritanceResult
    : {};

  await getCasesDb().case.update({
    where: {
      id,
    },
    data: {
      inheritanceResult: {
        ...previousResult,
        diagram: {
          svgKey,
          pdfKey,
          generatedAt: artifacts.generatedAt,
        },
      },
    },
  });

  return NextResponse.json({
    svgKey,
    pdfKey,
    generatedAt: artifacts.generatedAt,
  });
}
