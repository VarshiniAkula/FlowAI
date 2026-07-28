import type {
  ChoiceNodeData,
  ConditionNodeData,
  ExecutionContext,
  GraphEdge,
  InputNodeData,
  LlmResponseNodeData,
  MessageNodeData,
  NodeResult,
  RagQueryNodeData,
} from '@flowmind/shared';
import { renderTemplate } from './template';
import { evaluateCondition } from './condition';

/**
 * One handler per node type. Each handler returns a `NodeResult` with the
 * next node id, any state updates, messages to emit, whether to wait for the
 * user, and trace metadata.
 */

export type NodeHandler = (ctx: ExecutionContext) => Promise<NodeResult>;

/* -------------------------------------------------------------------------- */
/* message                                                                     */
/* -------------------------------------------------------------------------- */
export const handleMessage: NodeHandler = async (ctx) => {
  const data = ctx.node.data as MessageNodeData;
  const { text, missing } = renderTemplate(data.text ?? '', ctx.state.variables);
  return {
    nextNodeId: pickDefaultEdge(ctx),
    stateUpdates: {},
    messages: [{ content: text }],
    waitForUser: false,
    traceData: { template: data.text, rendered: text, missing },
  };
};

/* -------------------------------------------------------------------------- */
/* input                                                                       */
/* -------------------------------------------------------------------------- */
export const handleInput: NodeHandler = async (ctx) => {
  const data = ctx.node.data as InputNodeData;
  const variableName = data.variableName || 'input';

  // First entry: emit the prompt and wait.
  if (ctx.userMessage === undefined) {
    const { text } = renderTemplate(data.prompt ?? '', ctx.state.variables);
    return {
      nextNodeId: ctx.node.id, // stay on this node
      stateUpdates: {},
      messages: [{ content: text }],
      waitForUser: true,
      traceData: { phase: 'ask', variableName, prompt: text },
    };
  }

  // Second entry: capture the user's reply into the variable.
  return {
    nextNodeId: pickDefaultEdge(ctx),
    stateUpdates: {
      variables: { ...ctx.state.variables, [variableName]: ctx.userMessage },
    },
    messages: [],
    waitForUser: false,
    traceData: { phase: 'capture', variableName, value: ctx.userMessage },
  };
};

/* -------------------------------------------------------------------------- */
/* choice                                                                      */
/* -------------------------------------------------------------------------- */
export const handleChoice: NodeHandler = async (ctx) => {
  const data = ctx.node.data as ChoiceNodeData;
  const variableName = data.variableName || 'choice';
  const options = data.options ?? [];

  // First entry: present the prompt as an assistant message that lists the choices.
  if (ctx.userMessage === undefined) {
    const { text: prompt } = renderTemplate(data.prompt ?? '', ctx.state.variables);
    const lines = options.map((o, i) => `${i + 1}. ${o.label}`);
    return {
      nextNodeId: ctx.node.id,
      stateUpdates: {},
      messages: [{ content: [prompt, ...lines].filter(Boolean).join('\n') }],
      waitForUser: true,
      traceData: { phase: 'ask', options },
    };
  }

  // Second entry: match the user's reply to an option.
  const picked = matchChoice(ctx.userMessage, options);
  if (!picked) {
    return {
      nextNodeId: ctx.node.id, // stay and re-ask
      stateUpdates: {},
      messages: [
        {
          content: `I didn't catch that - please pick one of: ${options.map((o) => o.label).join(', ')}.`,
        },
      ],
      waitForUser: true,
      traceData: { phase: 'no-match', userInput: ctx.userMessage },
    };
  }

  // Outgoing edge whose sourceHandle matches the option id, falling back to
  // any default edge if no handle is set.
  const next =
    findEdgeByHandle(ctx, picked.id) ??
    findEdgeByHandle(ctx, picked.value) ??
    pickDefaultEdge(ctx);

  return {
    nextNodeId: next,
    stateUpdates: {
      variables: { ...ctx.state.variables, [variableName]: picked.value },
    },
    messages: [],
    waitForUser: false,
    traceData: { phase: 'pick', picked, next },
  };
};

/* -------------------------------------------------------------------------- */
/* condition                                                                   */
/* -------------------------------------------------------------------------- */
export const handleCondition: NodeHandler = async (ctx) => {
  const data = ctx.node.data as ConditionNodeData;
  let result = false;
  if (data.expression) {
    try {
      result = evaluateCondition(data.expression, ctx.state.variables);
    } catch (err) {
      return {
        nextNodeId: pickDefaultEdge(ctx),
        stateUpdates: {},
        messages: [],
        waitForUser: false,
        traceData: { error: String(err) },
      };
    }
  }

  const branchHandle = result ? 'true' : 'false';
  const next = findEdgeByHandle(ctx, branchHandle) ?? pickDefaultEdge(ctx);
  return {
    nextNodeId: next,
    stateUpdates: {},
    messages: [],
    waitForUser: false,
    traceData: { result, branch: branchHandle, expression: data.expression },
  };
};

/* -------------------------------------------------------------------------- */
/* rag_query                                                                   */
/* -------------------------------------------------------------------------- */
export const handleRagQuery: NodeHandler = async (ctx) => {
  const data = ctx.node.data as RagQueryNodeData;
  const { text: query } = renderTemplate(data.queryTemplate ?? '', ctx.state.variables);
  const topK = data.topK ?? 4;

  let chunks = [] as Awaited<ReturnType<typeof ctx.services.retrieval.query>>;
  try {
    chunks = await ctx.services.retrieval.query(query, topK);
  } catch (err) {
    return {
      nextNodeId: pickDefaultEdge(ctx),
      stateUpdates: {},
      messages: [],
      waitForUser: false,
      traceData: { query, error: String(err) },
    };
  }

  const formatted = chunks
    .map((c, i) => `[${i + 1}] (${c.source})\n${c.content}`)
    .join('\n\n');
  const variableName = data.resultVariable || 'context';

  return {
    nextNodeId: pickDefaultEdge(ctx),
    stateUpdates: {
      variables: { ...ctx.state.variables, [variableName]: formatted },
      retrievedChunks: chunks,
    },
    messages: [],
    waitForUser: false,
    traceData: { query, topK, retrieved: chunks.length, variableName },
  };
};

/* -------------------------------------------------------------------------- */
/* llm_response                                                                */
/* -------------------------------------------------------------------------- */
export const handleLlmResponse: NodeHandler = async (ctx) => {
  const data = ctx.node.data as LlmResponseNodeData;
  const variableName = data.resultVariable || 'answer';
  const { text: systemPrompt } = renderTemplate(
    data.systemPrompt ?? '',
    ctx.state.variables,
  );
  const { text: userPrompt } = renderTemplate(
    data.userTemplate ?? '',
    ctx.state.variables,
  );

  let answer = '';
  let info: Record<string, unknown> | undefined;
  try {
    const result = await ctx.services.llm.complete({
      systemPrompt,
      userPrompt,
      temperature: data.temperature ?? 0.7,
    });
    answer = result.text;
    // Sanitized provider metadata for the trace (no keys, prompts, reasoning).
    if (result.info) info = result.info as Record<string, unknown>;
  } catch (err) {
    answer = `(LLM error: ${String(err)})`;
  }

  return {
    nextNodeId: pickDefaultEdge(ctx),
    stateUpdates: {
      variables: { ...ctx.state.variables, [variableName]: answer },
    },
    messages: [],
    waitForUser: false,
    traceData: {
      // Prefer the actual provider/model reported by the service; fall back to
      // the node's configured model for the deterministic/offline path.
      provider: info?.provider ?? 'unknown',
      providerMode: info?.providerMode,
      model: info?.model ?? data.model,
      durationMs: info?.durationMs,
      inputTokens: info?.inputTokens,
      outputTokens: info?.outputTokens,
      demoRequestsRemaining: info?.demoRequestsRemaining,
      fallbackReason: info?.fallbackReason,
      systemPromptPreview: systemPrompt.slice(0, 200),
      userPromptPreview: userPrompt.slice(0, 200),
      answerPreview: answer.slice(0, 200),
    },
  };
};

/* -------------------------------------------------------------------------- */
/* utility helpers                                                             */
/* -------------------------------------------------------------------------- */
function outgoingEdges(ctx: ExecutionContext): GraphEdge[] {
  return ctx.graph.edges.filter((e) => e.source === ctx.node.id);
}

function pickDefaultEdge(ctx: ExecutionContext): string | null {
  const edges = outgoingEdges(ctx);
  if (edges.length === 0) return null;
  // Prefer an edge with no sourceHandle (the "default" out)
  const def = edges.find((e) => !e.sourceHandle);
  return (def ?? edges[0]!).target;
}

function findEdgeByHandle(ctx: ExecutionContext, handle: string): string | null {
  const edge = outgoingEdges(ctx).find((e) => e.sourceHandle === handle);
  return edge ? edge.target : null;
}

function matchChoice(
  userInput: string,
  options: ChoiceNodeData['options'],
): ChoiceNodeData['options'][number] | null {
  const trimmed = userInput.trim().toLowerCase();
  if (!trimmed) return null;

  // 1. Numeric pick (e.g. "1", "2.")
  const numMatch = trimmed.match(/^(\d+)/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]!, 10) - 1;
    if (idx >= 0 && idx < options.length) return options[idx]!;
  }

  // 2. Exact value or label match
  for (const opt of options) {
    if (opt.value.toLowerCase() === trimmed) return opt;
    if (opt.label.toLowerCase() === trimmed) return opt;
  }

  // 3. Partial label match
  for (const opt of options) {
    if (opt.label.toLowerCase().includes(trimmed)) return opt;
  }

  return null;
}

export const HANDLERS: Record<string, NodeHandler> = {
  message: handleMessage,
  input: handleInput,
  choice: handleChoice,
  condition: handleCondition,
  rag_query: handleRagQuery,
  llm_response: handleLlmResponse,
};
