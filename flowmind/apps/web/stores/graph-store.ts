'use client';

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type Connection,
  addEdge,
} from '@xyflow/react';
import type { GraphNode, GraphEdge, NodeType, NodeData } from '@flowmind/shared';
import { NODE_LABELS } from '@flowmind/shared';

type RFNode = GraphNode & { selected?: boolean };
type RFEdge = GraphEdge;

interface GraphStore {
  nodes: RFNode[];
  edges: RFEdge[];
  selectedNodeId: string | null;
  activeNodeId: string | null;

  setGraph: (nodes: RFNode[], edges: RFEdge[]) => void;
  resetGraph: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Partial<NodeData>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  deleteNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  setActiveNode: (id: string | null) => void;
}

const defaultDataForType = (type: NodeType): NodeData => {
  switch (type) {
    case 'message':
      return { text: 'Hello! How can I help you?' };
    case 'input':
      return { prompt: 'What is your name?', variableName: 'name' };
    case 'choice':
      return {
        prompt: 'Pick one',
        variableName: 'choice',
        options: [
          { id: nanoid(6), label: 'Option A', value: 'a' },
          { id: nanoid(6), label: 'Option B', value: 'b' },
        ],
      };
    case 'condition':
      return {
        expression: { field: 'name', operator: 'exists', value: null },
      };
    case 'rag_query':
      return {
        queryTemplate: '{{question}}',
        topK: 5,
        resultVariable: 'context',
      };
    case 'llm_response':
      return {
        systemPrompt: 'You are a helpful assistant.',
        userTemplate: '{{question}}',
        model: 'auto',
        temperature: 0.7,
        maxTokens: 1024,
        resultVariable: 'answer',
      };
    default:
      return {};
  }
};

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  activeNodeId: null,

  setGraph: (nodes, edges) => set({ nodes, edges, selectedNodeId: null, activeNodeId: null }),
  resetGraph: () => set({ nodes: [], edges: [], selectedNodeId: null, activeNodeId: null }),

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes as any) as RFNode[] });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges as any) as RFEdge[] });
  },

  onConnect: (connection) => {
    set({
      edges: addEdge(
        { ...connection, id: `edge_${nanoid(6)}` },
        get().edges as any,
      ) as RFEdge[],
    });
  },

  addNode: (type, position) => {
    const counter =
      get().nodes.filter((n) => n.type === type).length + 1;
    const id = `${type}_${counter}`;
    const node: RFNode = {
      id,
      type,
      position,
      label: `${NODE_LABELS[type]} ${counter}`,
      data: defaultDataForType(type),
    };
    set({ nodes: [...get().nodes, node], selectedNodeId: id });
  },

  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    });
  },

  updateNodeLabel: (id, label) => {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, label } : n)),
    });
  },

  deleteNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id }),
  setActiveNode: (id) => set({ activeNodeId: id }),
}));
