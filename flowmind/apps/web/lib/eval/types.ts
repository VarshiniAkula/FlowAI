import type { Graph } from '@flowmind/shared';

/** A tiny inline corpus item — an id plus its text. */
export interface CorpusItem {
  id: string;
  text: string;
}

/** One retrieval eval case: rank `corpus` for `query`, expect `relevantIds`. */
export interface RagCase {
  name: string;
  corpus: CorpusItem[];
  query: string;
  relevantIds: string[];
  k?: number;
}

/** One workflow eval case: run `graph` through `turns`, check expectations. */
export interface WorkflowCase {
  name: string;
  graph: Graph;
  /** Optional corpus for any rag_query nodes in the graph. */
  corpus?: CorpusItem[];
  /** User messages fed in order after the opening bot turn. */
  turns: string[];
  expect?: {
    completes?: boolean;
    /** captured variable name -> case-insensitive substring the value must contain. */
    variables?: Record<string, string>;
  };
}

export interface TestSet {
  rag?: RagCase[];
  workflows?: WorkflowCase[];
}
