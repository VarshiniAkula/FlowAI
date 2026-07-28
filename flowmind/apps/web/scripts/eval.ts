/*
 * scripts/eval.ts — offline RAG + workflow evaluation harness.
 *
 * Deterministic and provider-free: retrieval is scored with the BM25-lite
 * scorer, workflows run through the real runtime engine with stub services, so
 * no tokens are spent and results are reproducible (CI-friendly).
 *
 * Usage:
 *   pnpm --filter @flowmind/web eval [path/to/testset.json]
 * Default test set: eval/testset.json. Exits non-zero if any workflow case's
 * declared expectation (completes / captured variables) is not met.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runTestSet } from '@/lib/eval/runner';
import type { TestSet, WorkflowCase } from '@/lib/eval/types';

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function fixed(n: number): string {
  return n.toFixed(3);
}

async function main() {
  const path = resolve(process.cwd(), process.argv[2] ?? 'eval/testset.json');
  if (!existsSync(path)) {
    console.error(`Test set not found: ${path}`);
    process.exit(1);
  }
  const set = JSON.parse(readFileSync(path, 'utf8')) as TestSet;
  const report = await runTestSet(set);

  console.log(`\nFlowMind eval — ${path}\n${'='.repeat(60)}`);

  // --- RAG ---
  if (report.rag.cases.length > 0) {
    console.log('\nRAG retrieval');
    for (const c of report.rag.cases) {
      console.log(
        `  ${c.name}\n    P@${c.k}=${fixed(c.precisionAtK)}  R@${c.k}=${fixed(c.recallAtK)}  ` +
          `hit@${c.k}=${c.hitAtK}  MRR=${fixed(c.mrr)}  [${c.retrievedIds.join(', ')}]`,
      );
    }
    const a = report.rag.aggregate;
    console.log(
      `  ── mean: P=${fixed(a.precisionAtK)}  R=${fixed(a.recallAtK)}  ` +
        `hit=${fixed(a.hitAtK)}  MRR=${fixed(a.mrr)}`,
    );
  }

  // --- Workflow ---
  const byName = new Map<string, WorkflowCase>();
  for (const w of set.workflows ?? []) byName.set(w.name, w);
  let failures = 0;

  if (report.workflow.cases.length > 0) {
    console.log('\nWorkflow execution');
    for (const c of report.workflow.cases) {
      const expect = byName.get(c.name)?.expect ?? {};
      const completesOk = expect.completes === undefined || expect.completes === c.completed;
      const ok = completesOk && c.variablesOk;
      if (!ok) failures++;
      console.log(
        `  ${ok ? '✓' : '✗'} ${c.name}\n    completed=${c.completed}  ` +
          `coverage=${pct(c.nodeCoverage)}  turns=${c.turns}  errors=${c.errorCount}  ` +
          `varsOk=${c.variablesOk}`,
      );
    }
    const a = report.workflow.aggregate;
    console.log(
      `  ── completion=${pct(a.completionRate)}  coverage=${pct(a.avgNodeCoverage)}  ` +
        `avgTurns=${fixed(a.avgTurns)}  errorRate=${pct(a.errorRate)}  ` +
        `varAccuracy=${pct(a.variableAccuracy)}`,
    );
  }

  console.log(`\n${'='.repeat(60)}`);
  if (failures > 0) {
    console.error(`FAIL — ${failures} workflow case(s) did not meet expectations.\n`);
    process.exit(1);
  }
  console.log('PASS — all workflow expectations met.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
