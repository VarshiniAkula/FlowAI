export const NODE_COLORS = {
  message: 'bg-blue-500',
  input: 'bg-emerald-500',
  choice: 'bg-violet-500',
  condition: 'bg-orange-500',
  rag_query: 'bg-cyan-500',
  llm_response: 'bg-rose-500',
}

export const NODE_LABELS = {
  message: 'Message',
  input: 'Input',
  choice: 'Choice',
  condition: 'Condition',
  rag_query: 'RAG Query',
  llm_response: 'LLM Response',
}

export const NODE_ICONS = {
  message: '💬',
  input: '✏️',
  choice: '🔀',
  condition: '⚡',
  rag_query: '🔍',
  llm_response: '🤖',
}

export const NODE_DEFAULTS = {
  message: {
    type: 'message',
    text: 'Enter your message here',
  },
  input: {
    type: 'input',
    text: 'What is your response?',
    slot: 'user_input',
  },
  choice: {
    type: 'choice',
    text: 'Choose an option:',
    choices: { option_1: '', option_2: '' },
    default: '',
  },
  condition: {
    type: 'condition',
    expression: 'context.value == "expected"',
  },
  rag_query: {
    type: 'rag_query',
    query_template: '{{user_input}}',
    collection_id: 'flowai_documents',
    top_k: 3,
    context_slot: 'rag_context',
    doc_filter: [],
  },
  llm_response: {
    type: 'llm_response',
    system_prompt: 'You are a helpful assistant.',
    user_template: '{{user_input}}',
    model: 'claude-sonnet-4-6',
    response_slot: 'llm_reply',
  },
}

export function getNodeDefault(type) {
  return { ...(NODE_DEFAULTS[type] || NODE_DEFAULTS.message) }
}
