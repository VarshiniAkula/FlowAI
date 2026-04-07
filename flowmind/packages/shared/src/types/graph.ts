import type { NodeType } from '../constants/node-types';

export interface GraphNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
  label: string;
  description?: string;
  group?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: ConditionExpression;
}

export interface ConditionExpression {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists' | 'matches';
  value: unknown;
  logic?: 'and' | 'or';
  children?: ConditionExpression[];
}

export interface GraphVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description?: string;
  scope: 'session' | 'turn' | 'profile';
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  variables: GraphVariable[];
}

// Per-node data shapes
export interface MessageNodeData {
  text: string;
}

export interface InputNodeData {
  prompt: string;
  variableName: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  value: string;
}

export interface ChoiceNodeData {
  prompt: string;
  options: ChoiceOption[];
  variableName: string;
}

export interface ConditionNodeData {
  expression: ConditionExpression;
}

export interface RagQueryNodeData {
  queryTemplate: string;
  topK: number;
  resultVariable: string;
  sourceFilter?: string[];
}

export interface LlmResponseNodeData {
  systemPrompt: string;
  userTemplate: string;
  model: 'gemini-2.5-flash' | 'llama-3.3-70b' | 'auto';
  temperature: number;
  maxTokens: number;
  resultVariable: string;
}

export type NodeData =
  | MessageNodeData
  | InputNodeData
  | ChoiceNodeData
  | ConditionNodeData
  | RagQueryNodeData
  | LlmResponseNodeData
  | Record<string, unknown>;
