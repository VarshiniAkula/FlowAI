import { nanoid } from 'nanoid';
import type {
  AssistantMessage,
  ConversationState,
  ExecutionContext,
  Graph,
  GraphNode,
  RuntimeServices,
  TraceEvent,
} from '@flowmind/shared';
import { HANDLERS } from './handlers';

const MAX_STEPS_PER_TURN = 50;

export interface RunTurnOptions {
  graph: Graph;
  state: ConversationState;
  userMessage?: string;
  services: RuntimeServices;
}

export interface RunTurnResult {
  messages: AssistantMessage[];
  state: ConversationState;
  trace: TraceEvent[];
  done: boolean;
}

/**
 * Drive the flow forward until we either need to wait on the user, hit a
 * terminal node, or trip the safety bound.
 *
 * The engine is fully in-memory: callers (the simulator, the public chat
 * widget) own persistence and pass `state` back in each call.
 */
export async function runTurn(opts: RunTurnOptions): Promise<RunTurnResult> {
  const { graph, services } = opts;
  let state = cloneState(opts.state);
  const messages: AssistantMessage[] = [];
  const trace: TraceEvent[] = [];

  // Determine the starting node for this turn.
  let currentId = state.currentNodeId ?? findStartNodeId(graph);
  let userMessage: string | undefined = opts.userMessage;

  for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
    if (!currentId) {
      return { messages, state, trace, done: true };
    }

    const node = graph.nodes.find((n) => n.id === currentId);
    if (!node) {
      trace.push(makeTrace(currentId, 'unknown', { error: 'node not found' }, {}, 0));
      return { messages, state, trace, done: true };
    }

    const handler = HANDLERS[node.type];
    if (!handler) {
      trace.push(
        makeTrace(node.id, node.type, { error: 'no handler' }, {}, 0),
      );
      return { messages, state, trace, done: true };
    }

    const ctx: ExecutionContext = {
      node,
      state,
      graph,
      userMessage,
      services,
    };

    const t0 = Date.now();
    const result = await handler(ctx);
    const elapsed = Date.now() - t0;

    trace.push(
      makeTrace(
        node.id,
        node.type,
        { userMessage, variables: { ...state.variables } },
        { ...result.traceData, nextNodeId: result.nextNodeId },
        elapsed,
      ),
    );

    // Apply state updates.
    state = applyStateUpdates(state, result.stateUpdates);
    messages.push(...result.messages);

    // The user message is consumed by exactly one node per turn (the one we
    // were waiting on). After that, downstream nodes shouldn't see it.
    userMessage = undefined;

    if (result.waitForUser) {
      state.currentNodeId = result.nextNodeId; // stay on this node
      return { messages, state, trace, done: false };
    }

    currentId = result.nextNodeId;
  }

  // Safety stop — we shouldn't fall through unless the graph has a loop.
  trace.push(makeTrace('safety', 'engine', { error: 'max steps' }, {}, 0));
  state.currentNodeId = currentId;
  return { messages, state, trace, done: false };
}

export function createInitialState(): ConversationState {
  return {
    currentNodeId: null,
    variables: {},
    turnCount: 0,
    messages: [],
    metadata: {},
  };
}

function findStartNodeId(graph: Graph): string | null {
  if (graph.nodes.length === 0) return null;
  // The "start" is the node with no inbound edges.
  const targets = new Set(graph.edges.map((e) => e.target));
  const start = graph.nodes.find((n) => !targets.has(n.id));
  return (start ?? graph.nodes[0]!).id;
}

function cloneState(s: ConversationState): ConversationState {
  return {
    currentNodeId: s.currentNodeId,
    variables: { ...s.variables },
    turnCount: s.turnCount,
    messages: [...s.messages],
    retrievedChunks: s.retrievedChunks ? [...s.retrievedChunks] : undefined,
    metadata: { ...s.metadata },
  };
}

function applyStateUpdates(
  state: ConversationState,
  updates: Partial<ConversationState>,
): ConversationState {
  return {
    ...state,
    ...updates,
    variables: { ...state.variables, ...(updates.variables ?? {}) },
    metadata: { ...state.metadata, ...(updates.metadata ?? {}) },
  };
}

function makeTrace(
  nodeId: string,
  nodeType: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  latencyMs: number,
): TraceEvent {
  return {
    id: nanoid(8),
    nodeId,
    nodeType,
    input,
    output,
    latencyMs,
    timestamp: Date.now(),
  };
}

// Re-export so other modules don't need to peek into the helpers file.
export type { GraphNode };
