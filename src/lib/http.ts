import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      details: details ?? null,
    },
    {
      status,
    },
  );
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function parseBoolean(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") {
    return false;
  }

  return /^(1|true|on|yes)$/i.test(value.trim());
}

export function sanitizeTitle(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
