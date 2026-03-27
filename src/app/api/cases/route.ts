import { NextResponse } from "next/server";

import { createCase, listCases } from "@/lib/cases/repository";
import { jsonError, parseJsonBody, sanitizeTitle } from "@/lib/http";

type CreateCaseBody = {
  title?: string;
};

export async function GET() {
  const cases = await listCases();
  return NextResponse.json(cases);
}

export async function POST(request: Request) {
  const body = await parseJsonBody<CreateCaseBody>(request);
  const title = sanitizeTitle(body.title);

  if (!title) {
    return jsonError("ケースタイトルは必須です。", 400);
  }

  const created = await createCase({
    title,
    status: "created",
    matchingStatus: "pending",
    inheritanceResult: {},
  });

  return NextResponse.json(created, { status: 201 });
}
