import React, { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
} from '@xyflow/react'
import useFlowStore from '../../hooks/useFlowStore.js'
import MessageNode from '../nodes/MessageNode.jsx'
import InputNode from '../nodes/InputNode.jsx'
import ChoiceNode from '../nodes/ChoiceNode.jsx'
import ConditionNode from '../nodes/ConditionNode.jsx'
import RAGQueryNode from '../nodes/RAGQueryNode.jsx'
import LLMResponseNode from '../nodes/LLMResponseNode.jsx'

const nodeTypes = {
  message: MessageNode,
  input: InputNode,
  choice: ChoiceNode,
  condition: ConditionNode,
  rag_query: RAGQueryNode,
  llm_response: LLMResponseNode,
}

function FlowCanvasInner() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setSelectedNodeId, addNode,
  } = useFlowStore()
  const { screenToFlowPosition } = useReactFlow()

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id)
  }, [setSelectedNodeId])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [setSelectedNodeId])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/flowai-node-type')
    if (!type) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(type, position)
  }, [screenToFlowPosition, addNode])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      fitView
      deleteKeyCode="Delete"
      className="bg-gray-50"
    >
      <Background color="#e2e8f0" gap={20} />
      <Controls />
      <MiniMap
        nodeColor={(node) => {
          const colors = {
            message: '#3b82f6',
            input: '#10b981',
            choice: '#8b5cf6',
            condition: '#f97316',
            rag_query: '#06b6d4',
            llm_response: '#f43f5e',
          }
          return colors[node.type] || '#94a3b8'
        }}
        className="!bg-white !border !border-gray-200 !rounded-lg"
      />
      <Panel position="bottom-center">
        <p className="text-xs text-gray-400 bg-white px-2 py-1 rounded shadow-sm">
          Drag nodes from the palette • Click to select • Delete key removes selected
        </p>
      </Panel>
    </ReactFlow>
  )
}

export default function FlowCanvas() {
  return (
    <div className="flex-1 h-full">
      <FlowCanvasInner />
    </div>
  )
}
