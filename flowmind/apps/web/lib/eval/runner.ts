import type { RetrievedChunk, RuntimeServices, TraceEvent } from '@flowmind/shared';

import { createInitialState, runTurn } from '@/lib/runtime/engine';
import { scoreTexts } from '@/lib/knowledge/score';
import {
  aggregateWorkflow,
  mean,
  retrievalMetrics,
  type RetrievalMetrics,
  type WorkflowMetrics,
} from './metrics';
import type { CorpusItem, RagCase, TestSet, WorkflowCase } from './types';

/**
 * Offline eval runner. Deterministic + provider-free:
 *
 *  - Retrieval is scored with the lexical BM25-lite scorer over an inline corpus
 *    (the same scorer the production BM25 fallback uses), so results are stable
 *    without a Gemini key or network. (Vector-quality eval needs a key and is
 *    out of scope for the offline harness.)
 *  - Workflows run through the real runtime engine with STUB services (a fixed
 *    LLM reply + in-memory retrieval), so no tokens are spent.
 */

/* -------------------------------------------------------------------------- */
/* Retrieval                                                                   */
/* -------------------------------------------------------------------------- */

export interface RagCaseResult extends RetrievalMetrics {
  name: string;
  k: number;
  retrievedIds: string[];
}

function rankCorpus(corpus: CorpusItem[], query: string, k: number): string[] {
  const ranked = scoreTexts(query, corpus.map((c) => c.text), k);
  return ranked.map(({ index }) => corpus[index]!.id);
}

export function runRagCase(c: RagCase): RagCaseResult {
  const k = c.k ?? 4;
  const retrievedIds = rankCorpus(c.corpus, c.query, k);
  return { name: c.name, k, retrievedIds, ...retrievalMetrics(retrievedIds, c.relevantIds, k) };
}

/* -------------------------------------------------------------------------- */
/* Workflow                                                                    */
/* -------------------------------------------------------------------------- */

export interface WorkflowCaseResult extends WorkflowMetrics {
  name: string;
}

/** Deterministic, network-free services for driving a graph in the harness. */
function stubServices(corpus: CorpusItem[]): RuntimeServices {
  return {
    retrieval: {
      async query(query: string, topK: number): Promise<RetrievedChunk[]> {
        const ranked = scoreTexts(query, corpus.map((c) => c.text), topK);
        return ranked.map(({ index, score }) => {
          const item = corpus[index]!;
          return {
            content: item.text,
            source: item.id,
            score,
            documentId: item.id,
            metadata: {},
          };
        });
      },
    },
    llm: {
      async complete({ userPrompt }) {
        // Fixed, deterministic reply — the harness measures flow behavior, not
        // answer quality (that would need a real model / LLM judge).
        return { text: `[eval] ${userPrompt.slice(0, 60)}` };
      },
    },
  };
}

const NON_GRAPH_NODES = new Set(['safety', 'engine', 'unknown']);

function isErrorEvent(t: TraceEvent): boolean {
  const out = t.output as Record<string, unknown>;
  return Boolean(out?.error) || out?.phase === 'no-match';
}

export async function runWorkflowCase(c: WorkflowCase): Promise<WorkflowCaseResult> {
  const services = stubServices(c.corpus ?? []);
  const nodeIds = new Set(c.graph.nodes.map((n) => n.id));
  const allTrace: TraceEvent[] = [];

  // Opening bot turn, then feed each user turn until done or turns run out.
  let res = await runTurn({ graph: c.graph, state: createInitialState(), services });
  allTrace.push(...res.trace);

  let consumed = 0;
  for (const turn of c.turns) {
    if (res.done) break;
    res = await runTurn({ graph: c.graph, state: res.state, userMessage: turn, services });
    allTrace.push(...res.trace);
    consumed++;
  }

  const visited = new Set(
    allTrace.map((t) => t.nodeId).filter((id) => nodeIds.has(id) && !NON_GRAPH_NODES.has(id)),
  );
  const nodeCoverage = nodeIds.size === 0 ? 0 : visited.size / nodeIds.size;

  const vars = res.state.variables;
  const variablesOk = Object.entries(c.expect?.variables ?? {}).every(([name, needle]) =>
    String(vars[name] ?? '')
      .toLowerCase()
      .includes(needle.toLowerCase()),
  );

  return {
    name: c.name,
    completed: res.done,
    nodeCoverage,
    turns: consumed,
    errorCount: allTrace.filter(isErrorEvent).length,
    variablesOk,
  };
}

/* -------------------------------------------------------------------------- */
/* Full test set                                                               */
/* -------------------------------------------------------------------------- */

export interface EvalReport {
  rag: {
    cases: RagCaseResult[];
    aggregate: { precisionAtK: number; recallAtK: number; hitAtK: number; mrr: number };
  };
  workflow: {
    cases: WorkflowCaseResult[];
    aggregate: ReturnType<typeof aggregateWorkflow>;
  };
}

export async function runTestSet(set: TestSet): Promise<EvalReport> {
  const ragCases = (set.rag ?? []).map(runRagCase);
  const workflowCases: WorkflowCaseResult[] = [];
  for (const c of set.workflows ?? []) {
    workflowCases.push(await runWorkflowCase(c));
  }

  return {
    rag: {
      cases: ragCases,
      aggregate: {
        precisionAtK: mean(ragCases.map((r) => r.precisionAtK)),
        recallAtK: mean(ragCases.map((r) => r.recallAtK)),
        hitAtK: mean(ragCases.map((r) => r.hitAtK)),
        mrr: mean(ragCases.map((r) => r.mrr)),
      },
    },
    workflow: {
      cases: workflowCases,
      aggregate: aggregateWorkflow(workflowCases),
    },
  };
}
