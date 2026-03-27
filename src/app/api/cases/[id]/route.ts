import { NextResponse } from "next/server";

import {
  deleteCase,
  getCaseAggregate,
  updateCase,
} from "@/lib/cases/repository";
import { serializeCaseAggregate } from "@/lib/cases/workflow";
import { jsonError, parseJsonBody, sanitizeTitle } from "@/lib/http";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateCaseBody = {
  title?: string;
  status?: string;
  deceasedPersonId?: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const aggregate = await getCaseAggregate(id);

  if (!aggregate) {
    return jsonError("ケースが見つかりません。", 404);
  }

  return NextResponse.json(serializeCaseAggregate(aggregate));
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await parseJsonBody<UpdateCaseBody>(request);
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = sanitizeTitle(body.title);
    if (!title) {
      return jsonError("ケースタイトルは空にできません。", 400);
    }

    data.title = title;
  }

  if (body.status !== undefined) {
    const status = body.status.trim();
    if (!status) {
      return jsonError("status は空にできません。", 400);
    }

    data.status = status;
  }

  if (body.deceasedPersonId !== undefined) {
    data.deceasedPersonId = body.deceasedPersonId || null;
  }

  if (Object.keys(data).length === 0) {
    return jsonError("更新対象のフィールドがありません。", 400);
  }

  try {
    const updated = await updateCase(id, data);
    if (!updated) {
      return jsonError("ケースが見つかりません。", 404);
    }
  } catch {
    return jsonError("ケースが見つかりません。", 404);
  }

  const updated = await getCaseAggregate(id);

  if (!updated) {
    return jsonError("ケースが見つかりません。", 404);
  }

  return NextResponse.json(serializeCaseAggregate(updated));
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const deleted = await deleteCase(id);
  if (!deleted) {
    return jsonError("ケースが見つかりません。", 404);
  }

  return NextResponse.json({ success: true });
}
