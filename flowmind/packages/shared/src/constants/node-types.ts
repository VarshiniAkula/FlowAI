export const NODE_TYPES = [
  'message',
  'input',
  'choice',
  'condition',
  'rag_query',
  'llm_response',
  'http_action',
  'transform',
  'validator',
  'human_handoff',
  'loop',
  'subflow',
  'end',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const CORE_NODE_TYPES: NodeType[] = [
  'message',
  'input',
  'choice',
  'condition',
  'rag_query',
  'llm_response',
];

export const NODE_LABELS: Record<NodeType, string> = {
  message: 'Message',
  input: 'Input',
  choice: 'Choice',
  condition: 'Condition',
  rag_query: 'RAG Query',
  llm_response: 'LLM Response',
  http_action: 'HTTP Action',
  transform: 'Transform',
  validator: 'Validator',
  human_handoff: 'Human Handoff',
  loop: 'Loop',
  subflow: 'Subflow',
  end: 'End',
};

export const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  message: 'Send a message to the user',
  input: 'Capture user input into a variable',
  choice: 'Present options and branch by selection',
  condition: 'Branch based on a condition expression',
  rag_query: 'Query the knowledge base',
  llm_response: 'Generate a response with an LLM',
  http_action: 'Call an external HTTP API',
  transform: 'Transform variables in state',
  validator: 'Validate variables against rules',
  human_handoff: 'Transfer to a human agent',
  loop: 'Repeat a sub-graph until a condition',
  subflow: 'Invoke another flow',
  end: 'End the conversation',
};

export const NODE_COLORS: Record<NodeType, string> = {
  message: 'from-blue-500 to-blue-600',
  input: 'from-emerald-500 to-emerald-600',
  choice: 'from-violet-500 to-violet-600',
  condition: 'from-amber-500 to-orange-600',
  rag_query: 'from-cyan-500 to-cyan-600',
  llm_response: 'from-rose-500 to-pink-600',
  http_action: 'from-slate-500 to-slate-600',
  transform: 'from-indigo-500 to-indigo-600',
  validator: 'from-yellow-500 to-yellow-600',
  human_handoff: 'from-fuchsia-500 to-fuchsia-600',
  loop: 'from-teal-500 to-teal-600',
  subflow: 'from-purple-500 to-purple-600',
  end: 'from-gray-500 to-gray-700',
};

export const NODE_ICONS: Record<NodeType, string> = {
  message: 'MessageCircle',
  input: 'TextCursorInput',
  choice: 'GitBranch',
  condition: 'GitCompareArrows',
  rag_query: 'Database',
  llm_response: 'Sparkles',
  http_action: 'Globe',
  transform: 'Wand2',
  validator: 'ShieldCheck',
  human_handoff: 'UserRound',
  loop: 'Repeat',
  subflow: 'Layers',
  end: 'CircleStop',
};
