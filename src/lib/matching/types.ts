export type MatchStrategy = "exact" | "normalized" | "phonetic";

export type MatchCandidate = {
  personA: string;
  personB: string;
  strategy: MatchStrategy;
  confidence: number;
};

export type MatchResult = {
  matches: MatchCandidate[];
  unmatched: string[];
  requiresReview: MatchCandidate[];
};
