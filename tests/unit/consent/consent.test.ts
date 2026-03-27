import { afterEach, describe, expect, it, vi } from "vitest";

const getCaseAggregateMock = vi.fn();
const createDocumentMock = vi.fn();
const deleteUploadObjectMock = vi.fn();
const enqueueOcrJobMock = vi.fn();
const runOcrPipelineMock = vi.fn();

async function loadRoute() {
  vi.doMock("../../../src/lib/cases/repository", () => ({
    getCaseAggregate: getCaseAggregateMock,
    createDocument: createDocumentMock,
  }));
  vi.doMock("../../../src/lib/storage/r2-client", () => ({
    deleteUploadObject: deleteUploadObjectMock,
  }));
  vi.doMock("../../../src/lib/queue/jobs/ocr-job", () => ({
    enqueueOcrJob: enqueueOcrJobMock,
  }));
  vi.doMock("../../../src/lib/ocr/pipeline", () => ({
    runOcrPipeline: runOcrPipelineMock,
  }));

  return import("../../../src/app/api/cases/[id]/documents/route");
}

function buildJsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/cases/case-1/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cases/[id]/documents consent flow", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.OCR_EXECUTION_MODE;
    delete process.env.OCR_PROVIDER;
  });

  it("同意フラグなしなら 400 を返し、OCR 系処理を起動しない", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      buildJsonRequest({
        r2Key: "cases/case-1/documents/doc-1-koseki.png",
        originalFilename: "koseki.png",
        documentType: "computerized_koseki",
        consent: false,
      }),
      {
        params: Promise.resolve({ id: "case-1" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("同意"),
    });
    expect(createDocumentMock).not.toHaveBeenCalled();
    expect(enqueueOcrJobMock).not.toHaveBeenCalled();
    expect(runOcrPipelineMock).not.toHaveBeenCalled();
    expect(deleteUploadObjectMock).not.toHaveBeenCalled();
  });

  it("同意フラグありなら正常に queued document を作成する", async () => {
    getCaseAggregateMock.mockResolvedValue({
      id: "case-1",
      title: "case",
      status: "created",
      persons: [],
      documents: [],
      relationships: [],
      heirs: [],
    });
    createDocumentMock.mockResolvedValue({
      id: "doc-1",
      caseId: "case-1",
      originalFilename: "koseki.png",
      documentType: "computerized_koseki",
      status: "queued",
      requiresReview: false,
      reviewReason: [],
      createdAt: new Date("2026-03-27T11:00:00.000Z"),
    });
    enqueueOcrJobMock.mockResolvedValue(undefined);

    const { POST } = await loadRoute();
    const response = await POST(
      buildJsonRequest({
        r2Key: "cases/case-1/documents/doc-1-koseki.png",
        originalFilename: "koseki.png",
        documentType: "computerized_koseki",
        consent: true,
      }),
      {
        params: Promise.resolve({ id: "case-1" }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "doc-1",
      status: "queued",
    });
    expect(createDocumentMock).toHaveBeenCalledWith({
      caseId: "case-1",
      r2Key: "cases/case-1/documents/doc-1-koseki.png",
      originalFilename: "koseki.png",
      documentType: "computerized_koseki",
      status: "queued",
      ocrResult: {},
    });
    expect(enqueueOcrJobMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      caseId: "case-1",
    });
    expect(runOcrPipelineMock).not.toHaveBeenCalled();
    expect(deleteUploadObjectMock).not.toHaveBeenCalled();
  });

  it("別ケースの r2Key は 400 で拒否する", async () => {
    getCaseAggregateMock.mockResolvedValue({
      id: "case-1",
      title: "case",
      status: "created",
      persons: [],
      documents: [],
      relationships: [],
      heirs: [],
    });

    const { POST } = await loadRoute();
    const response = await POST(
      buildJsonRequest({
        r2Key: "cases/case-2/documents/doc-1-koseki.png",
        originalFilename: "koseki.png",
        documentType: "computerized_koseki",
        consent: true,
      }),
      {
        params: Promise.resolve({ id: "case-1" }),
      },
    );

    expect(response.status).toBe(400);
    expect(createDocumentMock).not.toHaveBeenCalled();
    expect(enqueueOcrJobMock).not.toHaveBeenCalled();
  });

  it("同意なしのとき Claude 実行経路(runOcrPipeline)を呼ばない", async () => {
    process.env.OCR_PROVIDER = "mock";
    process.env.OCR_EXECUTION_MODE = "inline";

    const { POST } = await loadRoute();
    const response = await POST(
      buildJsonRequest({
        r2Key: "cases/case-1/documents/doc-1-koseki.png",
        originalFilename: "koseki.png",
        documentType: "computerized_koseki",
        consent: false,
      }),
      {
        params: Promise.resolve({ id: "case-1" }),
      },
    );

    expect(response.status).toBe(400);
    expect(runOcrPipelineMock).not.toHaveBeenCalled();
  });
});
