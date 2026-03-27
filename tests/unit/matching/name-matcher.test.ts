import { describe, expect, it } from "vitest";

import { matchPersons } from "../../../src/lib/matching/name-matcher";
import type { ParsedPerson } from "../../../src/lib/parser/types";

function buildPerson(overrides: Partial<ParsedPerson> & Pick<ParsedPerson, "id" | "fullName">): ParsedPerson {
  return {
    id: overrides.id,
    fullName: overrides.fullName,
    fullNameKana: overrides.fullNameKana,
    birthDate: overrides.birthDate,
    deathDate: overrides.deathDate,
    gender: overrides.gender,
    address: overrides.address,
    events: overrides.events ?? [],
  };
}

describe("matchPersons", () => {
  it("classifies exact, normalized, phonetic, and unmatched persons in a nuclear family scenario", () => {
    const persons: ParsedPerson[] = [
      buildPerson({ id: "father-a", fullName: "齋藤 太郎", fullNameKana: "サイトウ タロウ" }),
      buildPerson({ id: "father-b", fullName: "斎藤 太郎", fullNameKana: "サイトウ タロウ" }),
      buildPerson({ id: "mother-a", fullName: "高橋 花子", fullNameKana: "タカハシ ハナコ" }),
      buildPerson({ id: "mother-b", fullName: "高橋 花子", fullNameKana: "タカハシ ハナコ" }),
      buildPerson({ id: "child-a", fullName: "山田 次郎", fullNameKana: "ヤマダ ジロウ" }),
      buildPerson({ id: "child-b", fullName: "山田 二郎", fullNameKana: "やまだ じろう" }),
      buildPerson({ id: "child-c", fullName: "山田 三郎", fullNameKana: "ヤマダ サブロウ" }),
    ];

    expect(matchPersons(persons)).toEqual({
      matches: [
        {
          personA: "mother-a",
          personB: "mother-b",
          strategy: "exact",
          confidence: 1,
        },
        {
          personA: "father-a",
          personB: "father-b",
          strategy: "normalized",
          confidence: 0.9,
        },
      ],
      requiresReview: [
        {
          personA: "child-a",
          personB: "child-b",
          strategy: "phonetic",
          confidence: 0.7,
        },
      ],
      unmatched: ["child-c"],
    });
  });

  it("prefers exact matches before lower-priority strategies", () => {
    const persons: ParsedPerson[] = [
      buildPerson({ id: "a", fullName: "佐藤 一郎", fullNameKana: "サトウ イチロウ" }),
      buildPerson({ id: "b", fullName: "佐藤 一郎", fullNameKana: "さとう いちろう" }),
    ];

    expect(matchPersons(persons).matches).toEqual([
      {
        personA: "a",
        personB: "b",
        strategy: "exact",
        confidence: 1,
      },
    ]);
  });

  it("keeps lower-confidence normalized pairs in requiresReview", () => {
    const persons: ParsedPerson[] = [
      buildPerson({ id: "a", fullName: "山田 太郎" }),
      buildPerson({ id: "b", fullName: "山田" }),
    ];

    expect(matchPersons(persons)).toEqual({
      matches: [],
      requiresReview: [
        {
          personA: "a",
          personB: "b",
          strategy: "normalized",
          confidence: 0.65,
        },
      ],
      unmatched: [],
    });
  });
});
