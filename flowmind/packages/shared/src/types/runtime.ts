import type { Graph, GraphNode } from './graph.js';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface RetrievedChunk {
  content: string;
  source: string;
  score: number;
  documentId: string;
  metadata: Record<string, unknown>;
}

export interface ConversationState {
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  turnCount: number;
  messages: ConversationMessage[];
  retrievedChunks?: RetrievedChunk[];
  metadata: Record<string, unknown>;
}

export interface AssistantMessage {
  content: string;
  citations?: Array<{ text: string; source: string; url?: string }>;
  metadata?: Record<string, unknown>;
}

export interface NodeResult {
  nextNodeId: string | null;
  stateUpdates: Partial<ConversationState>;
  messages: AssistantMessage[];
  waitForUser: boolean;
  traceData: Record<string, unknown>;
}

export interface TraceEvent {
  id: string;
  nodeId: string;
  nodeType: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  latencyMs: number;
  timestamp: number;
}

export interface ExecutionContext {
  node: GraphNode;
  state: ConversationState;
  graph: Graph;
  userMessage?: string;
  services: RuntimeServices;
}

export interface RuntimeServices {
  retrieval: {
    query: (query: string, topK: number) => Promise<RetrievedChunk[]>;
  };
  llm: {
    complete: (opts: { systemPrompt: string; userPrompt: string; temperature?: number }) => Promise<string>;
  };
}
