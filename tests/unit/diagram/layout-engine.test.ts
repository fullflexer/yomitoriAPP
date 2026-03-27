import { calculateLayout } from "../../../src/lib/diagram/layout-engine";
import type { DiagramInput } from "../../../src/lib/diagram/types";

describe("calculateLayout", () => {
  it("calculates positions for a deceased person, spouse, and two children", async () => {
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
          id: "spouse",
          name: "山田 花子",
          birthDate: "1960-02-01",
          isDeceased: false,
          role: "spouse",
          address: "東京都港区",
          relationshipLabel: "妻"
        },
        {
          id: "child-1",
          name: "山田 一郎",
          birthDate: "1988-03-04",
          isDeceased: false,
          role: "heir",
          address: "東京都世田谷区",
          relationshipLabel: "長男"
        },
        {
          id: "child-2",
          name: "山田 次郎",
          birthDate: "1992-07-08",
          isDeceased: false,
          role: "heir",
          address: "東京都渋谷区",
          relationshipLabel: "次男"
        }
      ],
      relationships: [
        { from: "deceased", to: "spouse", type: "marriage" },
        { from: "deceased", to: "child-1", type: "parent-child" },
        { from: "spouse", to: "child-1", type: "parent-child" },
        { from: "deceased", to: "child-2", type: "parent-child" },
        { from: "spouse", to: "child-2", type: "parent-child" }
      ]
    };

    const layout = await calculateLayout(input);

    expect(layout.nodes).toHaveLength(4);

    for (const node of layout.nodes) {
      expect(node.x).toBeDefined();
      expect(node.y).toBeDefined();
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });
});
