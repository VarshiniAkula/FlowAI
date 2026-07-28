import type { Graph, GraphNode } from './graph';

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

/**
 * Sanitized provider metadata surfaced by an LLM completion. Safe for the
 * execution trace: it carries no key material, prompts, or reasoning content.
 */
export interface LlmCompletionInfo {
  provider?: 'gemini' | 'groq' | 'deterministic';
  providerMode?: 'gemini-byok' | 'groq-demo' | 'gemini-platform' | 'simulation';
  model?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Remaining Groq demo requests for this user today (Groq demo only). */
  demoRequestsRemaining?: number;
  /** Sanitized reason a real provider was skipped (simulation only). */
  fallbackReason?: string;
}

/** Result of an LLM completion: the answer text plus sanitized provider info. */
export interface LlmCompleteResult {
  text: string;
  info?: LlmCompletionInfo;
}

export interface RuntimeServices {
  retrieval: {
    query: (query: string, topK: number) => Promise<RetrievedChunk[]>;
  };
  llm: {
    complete: (opts: {
      systemPrompt: string;
      userPrompt: string;
      temperature?: number;
      /**
       * Optional token-level callback. When provided, the service will request
       * a streaming completion from the underlying provider and invoke
       * `onChunk` for each delta. The promise still resolves with the full
       * result once the stream finishes, so callers that ignore `onChunk`
       * continue to work unchanged.
       */
      onChunk?: (delta: string) => void;
    }) => Promise<LlmCompleteResult>;
  };
}
