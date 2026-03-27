import type { ParseResult } from "./types";

export function validateParsedResult(
  result: ParseResult,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  result.persons.forEach((person, index) => {
    if (!person.fullName.trim()) {
      errors.push(`persons[${index}].fullName is required.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
