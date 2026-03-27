import { NextResponse } from "next/server";

import { getCaseAggregate, replaceCaseInheritanceData } from "@/lib/cases/repository";
import { prepareInheritance } from "@/lib/cases/workflow";
import { jsonError } from "@/lib/http";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function buildResponseFromAggregate(aggregate: NonNullable<Awaited<ReturnType<typeof getCaseAggregate>>>) {
  return {
    deceasedPersonId: aggregate.deceasedPersonId ?? null,
    heirs: aggregate.heirs,
    relationships: aggregate.relationships,
    inheritanceResult: aggregate.inheritanceResult ?? null,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const aggregate = await getCaseAggregate(id);

  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  return NextResponse.json(buildResponseFromAggregate(aggregate));
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const aggregate = await getCaseAggregate(id);

  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  if (aggregate.persons.length === 0) {
    return jsonError("相続判定の前に OCR 解析済み人物が必要です。", 409);
  }

  const prepared = prepareInheritance(aggregate);
  const previousResult = isObject(aggregate.inheritanceResult)
    ? aggregate.inheritanceResult
    : {};

  await replaceCaseInheritanceData({
    caseId: id,
    deceasedPersonId: prepared.deceasedPersonId,
    inheritanceResult: {
      ...previousResult,
      inheritance: prepared.inheritance,
      relationshipSources: prepared.relationshipSources,
      updatedAt: new Date().toISOString(),
    },
    relationships: prepared.relationships.map((relationship) => ({
      ...relationship,
      source: "derived",
      confidence: 0.8,
    })),
    heirs: prepared.inheritance.heirs.map((heir) => ({
      ...heir,
      status: "determined",
    })),
  });

  const updated = await getCaseAggregate(id);

  if (!updated) {
    return jsonError("ケースが見つかりません。", 404);
  }

  return NextResponse.json(buildResponseFromAggregate(updated));
}
