import { calculateLayout } from "../../../src/lib/diagram/layout-engine";
import { renderToSvg } from "../../../src/lib/diagram/svg-renderer";
import type { DiagramInput } from "../../../src/lib/diagram/types";

describe("renderToSvg", () => {
  it("renders an SVG document with required deceased text", async () => {
    const input: DiagramInput = {
      title: "相続関係図",
      persons: [
        {
          id: "deceased",
          name: "山田 太郎",
          deathDate: "2025-01-01",
          isDeceased: true,
          role: "deceased",
          domicile: "東京都千代田区",
          lastAddress: "東京都港区"
        },
        {
          id: "heir",
          name: "山田 花子",
          birthDate: "1960-02-01",
          isDeceased: false,
          role: "heir",
          address: "東京都港区",
          relationshipLabel: "妻"
        }
      ],
      relationships: [{ from: "deceased", to: "heir", type: "marriage" }]
    };

    const layout = await calculateLayout(input);
    const svg = renderToSvg(layout, input.title);

    expect(svg).toContain("<svg");
    expect(svg).toContain("山田 太郎");
    expect(svg).toContain("本籍: 東京都千代田区");
    expect(svg).toContain("最後の住所: 東京都港区");
    expect(svg).toContain("死亡日: 2025-01-01");
  });
});
