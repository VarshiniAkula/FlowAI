import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import { getNodeDefault } from '../utils/nodeDefaults.js'

let nodeCounter = 1

const useFlowStore = create((set, get) => ({
  // Flow metadata
  flowId: null,
  flowName: 'Untitled Flow',
  flowDescription: '',

  // ReactFlow state
  nodes: [],
  edges: [],
  selectedNodeId: null,

  // UI state
  isSaving: false,
  isGenerating: false,
  saveError: null,

  // Actions
  setFlowMeta: (meta) => set({ ...meta }),

  onNodesChange: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

  onEdgesChange: (changes) =>
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  onConnect: (connection) =>
    set((state) => ({ edges: addEdge({ ...connection, type: 'smoothstep' }, state.edges) })),

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  updateNodeData: (nodeId, patch) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
      ),
    })),

  addNode: (type, position) => {
    const id = `${type}_${nodeCounter++}`
    const newNode = {
      id,
      type,
      position: position || { x: 200 + Math.random() * 100, y: 100 + Math.random() * 100 },
      data: { ...getNodeDefault(type), id },
    }
    set((state) => ({ nodes: [...state.nodes, newNode] }))
    return id
  },

  deleteNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    })),

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  loadFlow: (rfNodes, rfEdges, meta) =>
    set({
      nodes: rfNodes,
      edges: rfEdges,
      flowId: meta.flowId || null,
      flowName: meta.flowName || 'Untitled Flow',
      flowDescription: meta.flowDescription || '',
    }),

  setSaving: (isSaving) => set({ isSaving }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setSaveError: (saveError) => set({ saveError }),
}))

export default useFlowStore
