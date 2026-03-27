export type Gender = "male" | "female" | "other";

export type Person = {
  id: string;
  fullName: string;
  birthDate?: string;
  deathDate?: string;
  gender?: Gender;
};

export type RelationshipType = "parent" | "child" | "spouse" | "sibling";

export type Relationship = {
  fromPersonId: string;
  toPersonId: string;
  relationType: RelationshipType;
};

export type FamilyGraph = {
  persons: Person[];
  relationships: Relationship[];
};

export type HeirClass = "spouse" | "class1" | "class2" | "class3";

export type Heir = {
  personId: string;
  heirClass: HeirClass;
  shareNumerator: number;
  shareDenominator: number;
};

export type InheritanceResult = {
  deceasedId: string;
  heirs: Heir[];
  unsupportedCases: string[];
  warnings: string[];
};
