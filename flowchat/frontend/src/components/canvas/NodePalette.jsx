import React from 'react'
import { NODE_COLORS, NODE_LABELS, NODE_ICONS } from '../../utils/nodeDefaults.js'

const NODE_TYPES = ['message', 'input', 'choice', 'condition', 'rag_query', 'llm_response']

function PaletteItem({ type }) {
  const color = NODE_COLORS[type]
  const label = NODE_LABELS[type]
  const icon = NODE_ICONS[type]

  const onDragStart = (e) => {
    e.dataTransfer.setData('application/flowai-node-type', type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab border border-gray-200 bg-white hover:shadow-md transition-shadow select-none"
      title={`Drag to add ${label} node`}
    >
      <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs ${color}`}>
        {icon}
      </div>
      <span className="text-xs text-gray-700 font-medium">{label}</span>
    </div>
  )
}

export default function NodePalette() {
  return (
    <div className="w-52 h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Node Types</h3>
        <p className="text-xs text-gray-400 mt-0.5">Drag onto canvas</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {NODE_TYPES.map((type) => (
          <PaletteItem key={type} type={type} />
        ))}
      </div>
    </div>
  )
}
