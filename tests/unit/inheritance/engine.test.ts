import { describe, expect, it } from "vitest";

import { determineHeirs } from "../../../src/lib/inheritance/engine";
import type {
  FamilyGraph,
  Heir,
  Person,
} from "../../../src/lib/inheritance/types";

function buildGraph(
  persons: Person[],
  relationships: FamilyGraph["relationships"],
): FamilyGraph {
  return { persons, relationships };
}

describe("determineHeirs", () => {
  const deceased: Person = {
    id: "deceased",
    fullName: "被相続人",
    deathDate: "2026-03-27",
  };

  const spouse: Person = {
    id: "spouse",
    fullName: "配偶者",
  };

  const child1: Person = {
    id: "child-1",
    fullName: "子1",
  };

  const child2: Person = {
    id: "child-2",
    fullName: "子2",
  };

  const child3: Person = {
    id: "child-3",
    fullName: "子3",
  };

  const cases: Array<{
    name: string;
    graph: FamilyGraph;
    expectedHeirs: Heir[];
    expectedUnsupported: string[];
  }> = [
    {
      name: "配偶者のみ",
      graph: buildGraph([deceased, spouse], [
        {
          fromPersonId: deceased.id,
          toPersonId: spouse.id,
          relationType: "spouse",
        },
      ]),
      expectedHeirs: [
        {
          personId: spouse.id,
          heirClass: "spouse",
          shareNumerator: 1,
          shareDenominator: 1,
        },
      ],
      expectedUnsupported: [],
    },
    {
      name: "子のみ",
      graph: buildGraph([deceased, child1, child2], [
        {
          fromPersonId: deceased.id,
          toPersonId: child1.id,
          relationType: "parent",
        },
        {
          fromPersonId: deceased.id,
          toPersonId: child2.id,
          relationType: "parent",
        },
      ]),
      expectedHeirs: [
        {
          personId: child1.id,
          heirClass: "class1",
          shareNumerator: 1,
          shareDenominator: 2,
        },
        {
          personId: child2.id,
          heirClass: "class1",
          shareNumerator: 1,
          shareDenominator: 2,
        },
      ],
      expectedUnsupported: [],
    },
    {
      name: "配偶者と子1人",
      graph: buildGraph([deceased, spouse, child1], [
        {
          fromPersonId: deceased.id,
          toPersonId: spouse.id,
          relationType: "spouse",
        },
        {
          fromPersonId: deceased.id,
          toPersonId: child1.id,
          relationType: "parent",
        },
      ]),
      expectedHeirs: [
        {
          personId: spouse.id,
          heirClass: "spouse",
          shareNumerator: 1,
          shareDenominator: 2,
        },
        {
          personId: child1.id,
          heirClass: "class1",
          shareNumerator: 1,
          shareDenominator: 2,
        },
      ],
      expectedUnsupported: [],
    },
    {
      name: "配偶者と子3人",
      graph: buildGraph([deceased, spouse, child1, child2, child3], [
        {
          fromPersonId: deceased.id,
          toPersonId: spouse.id,
          relationType: "spouse",
        },
        {
          fromPersonId: deceased.id,
          toPersonId: child1.id,
          relationType: "parent",
        },
        {
          fromPersonId: deceased.id,
          toPersonId: child2.id,
          relationType: "parent",
        },
        {
          fromPersonId: deceased.id,
          toPersonId: child3.id,
          relationType: "parent",
        },
      ]),
      expectedHeirs: [
        {
          personId: spouse.id,
          heirClass: "spouse",
          shareNumerator: 1,
          shareDenominator: 2,
        },
        {
          personId: child1.id,
          heirClass: "class1",
          shareNumerator: 1,
          shareDenominator: 6,
        },
        {
          personId: child2.id,
          heirClass: "class1",
          shareNumerator: 1,
          shareDenominator: 6,
        },
        {
          personId: child3.id,
          heirClass: "class1",
          shareNumerator: 1,
          shareDenominator: 6,
        },
      ],
      expectedUnsupported: [],
    },
    {
      name: "子なし配偶者なし",
      graph: buildGraph([deceased], []),
      expectedHeirs: [],
      expectedUnsupported: [
        `No spouse or children were found for "${deceased.id}"; class2/class3 inheritance is unsupported.`,
      ],
    },
  ];

  it.each(cases)("$name", ({ graph, expectedHeirs, expectedUnsupported }) => {
    const result = determineHeirs(graph, deceased.id);

    expect(result.heirs).toEqual(expectedHeirs);
    expect(result.heirs.every((heir) => heir.personId !== deceased.id)).toBe(true);
    expect(result.unsupportedCases).toEqual(expectedUnsupported);
    expect(result.warnings).toEqual([]);
  });

  it("非対応ケースを検出する", () => {
    const predeceasedChild: Person = {
      id: "child-predeceased",
      fullName: "先死亡の子",
      deathDate: "2025-01-01",
    };
    const grandchild: Person = {
      id: "grandchild",
      fullName: "孫",
    };
    const formerSpouse: Person = {
      id: "former-spouse",
      fullName: "前配偶者",
    };

    const result = determineHeirs(
      buildGraph(
        [deceased, spouse, formerSpouse, predeceasedChild, grandchild],
        [
          {
            fromPersonId: deceased.id,
            toPersonId: spouse.id,
            relationType: "spouse",
          },
          {
            fromPersonId: deceased.id,
            toPersonId: formerSpouse.id,
            relationType: "spouse",
          },
          {
            fromPersonId: deceased.id,
            toPersonId: predeceasedChild.id,
            relationType: "parent",
          },
          {
            fromPersonId: predeceasedChild.id,
            toPersonId: grandchild.id,
            relationType: "parent",
          },
        ],
      ),
      deceased.id,
    );

    expect(result.unsupportedCases).toEqual(
      expect.arrayContaining([
        `Multiple spouses were linked to "${deceased.id}"; divorce/remarriage history is unsupported.`,
        `Predeceased child "${predeceasedChild.id}" has descendants; representation inheritance is unsupported.`,
      ]),
    );
    expect(result.heirs).toEqual([]);
  });

  it("代襲が絡む場合は部分的なheirsを返さない", () => {
    const livingChild: Person = {
      id: "living-child",
      fullName: "生存している子",
    };
    const predeceasedChild: Person = {
      id: "predeceased-child",
      fullName: "先死亡の子",
      deathDate: "2025-01-01",
    };
    const grandchild: Person = {
      id: "grandchild-2",
      fullName: "孫",
    };

    const result = determineHeirs(
      buildGraph(
        [deceased, spouse, livingChild, predeceasedChild, grandchild],
        [
          {
            fromPersonId: deceased.id,
            toPersonId: spouse.id,
            relationType: "spouse",
          },
          {
            fromPersonId: deceased.id,
            toPersonId: livingChild.id,
            relationType: "parent",
          },
          {
            fromPersonId: deceased.id,
            toPersonId: predeceasedChild.id,
            relationType: "parent",
          },
          {
            fromPersonId: predeceasedChild.id,
            toPersonId: grandchild.id,
            relationType: "parent",
          },
        ],
      ),
      deceased.id,
    );

    expect(result.unsupportedCases).toContain(
      `Predeceased child "${predeceasedChild.id}" has descendants; representation inheritance is unsupported.`,
    );
    expect(result.heirs).toEqual([]);
  });

  it("死亡日なしの被相続人にはwarningを返す", () => {
    const result = determineHeirs(
      buildGraph(
        [
          {
            id: "deceased-without-death-date",
            fullName: "死亡日未設定",
          },
          spouse,
        ],
        [
          {
            fromPersonId: "deceased-without-death-date",
            toPersonId: spouse.id,
            relationType: "spouse",
          },
        ],
      ),
      "deceased-without-death-date",
    );

    expect(result.heirs).toEqual([
      {
        personId: spouse.id,
        heirClass: "spouse",
        shareNumerator: 1,
        shareDenominator: 1,
      },
    ]);
    expect(result.warnings).toEqual([
      'Person "deceased-without-death-date" is treated as deceased, but deathDate is missing.',
    ]);
  });
});
