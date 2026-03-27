import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  launchMock,
  newPageMock,
  setContentMock,
  pdfMock,
  closeMock,
} = vi.hoisted(() => ({
  launchMock: vi.fn(),
  newPageMock: vi.fn(),
  setContentMock: vi.fn(),
  pdfMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock("puppeteer-core", () => ({
  default: {
    launch: launchMock,
  },
}));

import { renderToPdf } from "../../../src/lib/diagram/pdf-renderer";

describe("renderToPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMock.mockResolvedValue(Buffer.from("%PDF-1.7\nmock"));
    setContentMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({
      setContent: setContentMock,
      pdf: pdfMock,
    });
    closeMock.mockResolvedValue(undefined);
    launchMock.mockResolvedValue({
      newPage: newPageMock,
      close: closeMock,
    });
    process.env.PUPPETEER_EXECUTABLE_PATH = "/bin/echo";
  });

  it("renders an A4 PDF buffer from SVG", async () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 2100 2970">
  <rect width="2100" height="2970" fill="#ffffff" />
  <text x="120" y="180" font-size="48">相続関係図</text>
</svg>`;

    const pdf = await renderToPdf(svg);

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(setContentMock).toHaveBeenCalledTimes(1);
    expect(pdfMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString()).toContain("%PDF-");
  });
});
