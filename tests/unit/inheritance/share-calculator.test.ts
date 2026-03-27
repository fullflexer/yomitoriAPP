import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { calculateShares } from "../../../src/lib/inheritance/share-calculator";
import type { Person } from "../../../src/lib/inheritance/types";

const personArbitrary: fc.Arbitrary<Person> = fc.record({
  id: fc.uuid(),
  fullName: fc.string({ minLength: 1, maxLength: 20 }),
  birthDate: fc.constant(undefined),
  deathDate: fc.constant(undefined),
  gender: fc.constant(undefined),
});

const spouseAndChildrenArbitrary = fc
  .tuple(
    fc.option(personArbitrary, { nil: null }),
    fc.uniqueArray(personArbitrary, {
      selector: (person) => person.id,
      maxLength: 6,
    }),
  )
  .filter(([spouse, children]) => spouse !== null || children.length > 0)
  .filter(([spouse, children]) =>
    spouse === null ? true : children.every((child) => child.id !== spouse.id),
  );

function sumFractions(
  heirs: Array<{ shareNumerator: number; shareDenominator: number }>,
): number {
  return heirs.reduce(
    (total, heir) => total + heir.shareNumerator / heir.shareDenominator,
    0,
  );
}

describe("calculateShares", () => {
  it("相続分合計は常に1になる", () => {
    fc.assert(
      fc.property(spouseAndChildrenArbitrary, ([spouse, children]) => {
        const heirs = calculateShares(spouse, children);
        expect(sumFractions(heirs)).toBeCloseTo(1, 10);
      }),
      { numRuns: 100 },
    );
  });

  it("被相続人はheirsに含まれない", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(fc.uuid(), spouseAndChildrenArbitrary)
          .filter(([deceasedId, [spouse, children]]) => {
            if (spouse?.id === deceasedId) {
              return false;
            }

            return children.every((child) => child.id !== deceasedId);
          }),
        ([deceasedId, [spouse, children]]) => {
          const heirs = calculateShares(spouse, children);
          const allowedIds = new Set([
            ...(spouse ? [spouse.id] : []),
            ...children.map((child) => child.id),
          ]);
          const heirIds = heirs.map((heir) => heir.personId);

          expect(heirIds.every((heirId) => allowedIds.has(heirId))).toBe(true);
          expect(new Set(heirIds).size).toBe(heirIds.length);
          expect(heirIds.every((heirId) => heirId !== deceasedId)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("全heirのshareは正になる", () => {
    fc.assert(
      fc.property(spouseAndChildrenArbitrary, ([spouse, children]) => {
        const heirs = calculateShares(spouse, children);

        expect(
          heirs.every(
            (heir) => heir.shareNumerator > 0 && heir.shareDenominator > 0,
          ),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
