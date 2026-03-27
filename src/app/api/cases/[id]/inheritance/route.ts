import { NextResponse } from "next/server";

import { getCaseAggregate, getCasesDb } from "@/lib/cases/repository";
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
  const db = getCasesDb() as unknown as {
    $transaction<T>(callback: (tx: Record<string, unknown>) => Promise<T>): Promise<T>;
  };

  await db.$transaction(async (tx) => {
    const transaction = tx as {
      relationship: {
        deleteMany(args: Record<string, unknown>): Promise<unknown>;
        createMany(args: Record<string, unknown>): Promise<unknown>;
      };
      heir: {
        deleteMany(args: Record<string, unknown>): Promise<unknown>;
        createMany(args: Record<string, unknown>): Promise<unknown>;
      };
      case: {
        update(args: Record<string, unknown>): Promise<unknown>;
      };
    };

    await transaction.relationship.deleteMany({
      where: {
        caseId: id,
      },
    });

    if (prepared.relationships.length > 0) {
      await transaction.relationship.createMany({
        data: prepared.relationships.map((relationship) => ({
          caseId: id,
          fromPersonId: relationship.fromPersonId,
          toPersonId: relationship.toPersonId,
          relationType: relationship.relationType,
          source: "derived",
          confidence: 0.8,
        })),
      });
    }

    await transaction.heir.deleteMany({
      where: {
        caseId: id,
      },
    });

    if (prepared.inheritance.heirs.length > 0) {
      await transaction.heir.createMany({
        data: prepared.inheritance.heirs.map((heir) => ({
          caseId: id,
          personId: heir.personId,
          heirClass: heir.heirClass,
          shareNumerator: heir.shareNumerator,
          shareDenominator: heir.shareDenominator,
          status: "determined",
        })),
      });
    }

    const previousResult = isObject(aggregate.inheritanceResult)
      ? aggregate.inheritanceResult
      : {};

    await transaction.case.update({
      where: {
        id,
      },
      data: {
        deceasedPersonId: prepared.deceasedPersonId,
        inheritanceResult: {
          ...previousResult,
          inheritance: prepared.inheritance,
          relationshipSources: prepared.relationshipSources,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  });

  const updated = await getCaseAggregate(id);

  if (!updated) {
    return jsonError("ケースが見つかりません。", 404);
  }

  return NextResponse.json(buildResponseFromAggregate(updated));
}
