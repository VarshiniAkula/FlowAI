import type { NodeTypes } from '@xyflow/react';
import { MessageNode } from './message-node';
import { InputNode } from './input-node';
import { ChoiceNode } from './choice-node';
import { ConditionNode } from './condition-node';
import { RagQueryNode } from './rag-query-node';
import { LlmResponseNode } from './llm-response-node';

export const nodeTypes: NodeTypes = {
  message: MessageNode,
  input: InputNode,
  choice: ChoiceNode,
  condition: ConditionNode,
  rag_query: RagQueryNode,
  llm_response: LlmResponseNode,
};
