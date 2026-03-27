import { afterEach, describe, expect, it, vi } from "vitest";

const getCaseAggregateMock = vi.fn();
const generatePresignedPutUrlMock = vi.fn();

async function loadRoute() {
  vi.doMock("node:crypto", () => ({
    randomUUID: () => "uuid-123",
  }));
  vi.doMock("../../../src/lib/cases/repository", () => ({
    getCaseAggregate: getCaseAggregateMock,
  }));
  vi.doMock("../../../src/lib/storage/r2-client", () => ({
    generatePresignedPutUrl: generatePresignedPutUrlMock,
  }));

  return import("../../../src/app/api/cases/[id]/documents/presign/route");
}

function buildJsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/cases/case-1/documents/presign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cases/[id]/documents/presign", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("consent=false なら 400 を返して presign を発行しない", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      buildJsonRequest({
        filename: "koseki.png",
        contentType: "image/png",
        consent: false,
      }),
      {
        params: Promise.resolve({ id: "case-1" }),
      },
    );

    expect(response.status).toBe(400);
    expect(getCaseAggregateMock).not.toHaveBeenCalled();
    expect(generatePresignedPutUrlMock).not.toHaveBeenCalled();
  });

  it("presigned PUT URL と case 配下の r2Key を返す", async () => {
    getCaseAggregateMock.mockResolvedValue({
      id: "case-1",
      title: "case",
      status: "created",
      persons: [],
      documents: [],
      relationships: [],
      heirs: [],
    });
    generatePresignedPutUrlMock.mockResolvedValue("http://localhost:9000/upload");

    const { POST } = await loadRoute();
    const response = await POST(
      buildJsonRequest({
        filename: "family register 01.png",
        contentType: "image/png",
        consent: true,
      }),
      {
        params: Promise.resolve({ id: "case-1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      uploadUrl: "http://localhost:9000/upload",
      r2Key: "cases/case-1/documents/uuid-123-family_register_01.png",
    });
    expect(generatePresignedPutUrlMock).toHaveBeenCalledWith(
      "cases/case-1/documents/uuid-123-family_register_01.png",
      "image/png",
    );
  });
});
