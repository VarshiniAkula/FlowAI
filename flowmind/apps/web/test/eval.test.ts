import { describe, expect, it } from 'vitest';

import {
  precisionAtK,
  recallAtK,
  hitAtK,
  reciprocalRank,
  retrievalMetrics,
} from '@/lib/eval/metrics';
import { runTestSet } from '@/lib/eval/runner';
import type { TestSet } from '@/lib/eval/types';

describe('retrieval metrics', () => {
  const relevant = new Set(['b', 'd']);

  it('precision@k = relevant in top-k / k', () => {
    expect(precisionAtK(['a', 'b', 'c', 'd'], relevant, 2)).toBe(0.5); // {b} of 2
    expect(precisionAtK(['b', 'd', 'a'], relevant, 2)).toBe(1);
  });

  it('recall@k = relevant in top-k / |relevant|', () => {
    expect(recallAtK(['a', 'b', 'c', 'd'], relevant, 2)).toBe(0.5); // {b} of {b,d}
    expect(recallAtK(['b', 'd'], relevant, 2)).toBe(1);
  });

  it('hit@k is 1 iff any relevant is in the top-k', () => {
    expect(hitAtK(['a', 'c', 'b'], relevant, 2)).toBe(0);
    expect(hitAtK(['a', 'b', 'c'], relevant, 2)).toBe(1);
  });

  it('reciprocal rank is 1 / rank of the first relevant', () => {
    expect(reciprocalRank(['a', 'b', 'd'], relevant)).toBe(0.5);
    expect(reciprocalRank(['b', 'a'], relevant)).toBe(1);
    expect(reciprocalRank(['x', 'y'], relevant)).toBe(0);
  });

  it('retrievalMetrics bundles all four', () => {
    const m = retrievalMetrics(['b', 'x'], ['b', 'd'], 2);
    expect(m).toMatchObject({ hitAtK: 1, mrr: 1, recallAtK: 0.5, precisionAtK: 0.5 });
  });
});

describe('runTestSet', () => {
  it('scores retrieval and drives workflows deterministically (no network)', async () => {
    const set: TestSet = {
      rag: [
        {
          name: 'baggage',
          query: 'baggage allowance kg',
          relevantIds: ['c1'],
          k: 2,
          corpus: [
            { id: 'c1', text: 'baggage allowance is 23kg checked' },
            { id: 'c2', text: 'seat selection is free' },
          ],
        },
      ],
      workflows: [
        {
          name: 'two messages',
          turns: [],
          expect: { completes: true },
          graph: {
            variables: [],
            nodes: [
              { id: 'a', type: 'message', label: 'A', position: { x: 0, y: 0 }, data: { text: 'Hi' } },
              { id: 'b', type: 'message', label: 'B', position: { x: 0, y: 1 }, data: { text: 'Bye' } },
            ],
            edges: [{ id: 'e', source: 'a', target: 'b' }],
          },
        },
      ],
    };

    const report = await runTestSet(set);
    expect(report.rag.cases[0]!.hitAtK).toBe(1);
    expect(report.rag.aggregate.recallAtK).toBe(1);
    expect(report.workflow.cases[0]!.completed).toBe(true);
    expect(report.workflow.cases[0]!.nodeCoverage).toBe(1);
    expect(report.workflow.aggregate.completionRate).toBe(1);
  });
});
