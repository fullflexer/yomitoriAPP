export function combineScores(scores: { strategy: string; score: number }[]): number {
  return scores.reduce((maxScore, entry) => Math.max(maxScore, entry.score), 0);
}
