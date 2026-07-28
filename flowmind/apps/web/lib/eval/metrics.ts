/**
 * Pure evaluation metrics — no I/O, no providers, so they are fully
 * deterministic and unit-testable. Used by the offline eval harness
 * (`scripts/eval.ts`).
 */

/** Fraction of the top-k that are relevant: |relevant ∩ topK| / k. */
export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (k <= 0) return 0;
  const top = retrieved.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / k;
}

/** Fraction of relevant items found in the top-k: |relevant ∩ topK| / |relevant|. */
export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const top = retrieved.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

/** 1 if any relevant item is in the top-k, else 0. */
export function hitAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  return retrieved.slice(0, k).some((id) => relevant.has(id)) ? 1 : 0;
}

/** Reciprocal rank of the first relevant item (1-indexed); 0 if none retrieved. */
export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i]!)) return 1 / (i + 1);
  }
  return 0;
}

/** Mean of a list of numbers (0 for an empty list). */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export interface RetrievalMetrics {
  precisionAtK: number;
  recallAtK: number;
  hitAtK: number;
  mrr: number;
}

/** Compute the four retrieval metrics for one query. */
export function retrievalMetrics(
  retrieved: string[],
  relevant: Iterable<string>,
  k: number,
): RetrievalMetrics {
  const rel = new Set(relevant);
  return {
    precisionAtK: precisionAtK(retrieved, rel, k),
    recallAtK: recallAtK(retrieved, rel, k),
    hitAtK: hitAtK(retrieved, rel, k),
    mrr: reciprocalRank(retrieved, rel),
  };
}

export interface WorkflowMetrics {
  completed: boolean;
  /** Unique real graph nodes visited / total graph nodes. */
  nodeCoverage: number;
  turns: number;
  errorCount: number;
  /** True when every expected variable matched (or none were expected). */
  variablesOk: boolean;
}

/** Average a list of workflow metric records into headline numbers. */
export function aggregateWorkflow(rows: WorkflowMetrics[]): {
  completionRate: number;
  avgNodeCoverage: number;
  avgTurns: number;
  errorRate: number;
  variableAccuracy: number;
} {
  return {
    completionRate: mean(rows.map((r) => (r.completed ? 1 : 0))),
    avgNodeCoverage: mean(rows.map((r) => r.nodeCoverage)),
    avgTurns: mean(rows.map((r) => r.turns)),
    errorRate: mean(rows.map((r) => (r.errorCount > 0 ? 1 : 0))),
    variableAccuracy: mean(rows.map((r) => (r.variablesOk ? 1 : 0))),
  };
}
