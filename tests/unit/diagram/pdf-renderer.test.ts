import { renderToPdf } from "../../../src/lib/diagram/pdf-renderer";

describe("renderToPdf", () => {
  it("renders an A4 PDF buffer from SVG", async () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 2100 2970">
  <rect width="2100" height="2970" fill="#ffffff" />
  <text x="120" y="180" font-size="48">相続関係図</text>
</svg>`;

    const pdf = await renderToPdf(svg);

    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString()).toContain("%PDF-");
  }, 30_000);
});
