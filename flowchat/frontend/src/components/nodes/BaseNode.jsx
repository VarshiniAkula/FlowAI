import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { NODE_COLORS, NODE_LABELS, NODE_ICONS } from '../../utils/nodeDefaults.js'

export default function BaseNode({ id, type, data, selected, children, extraHandles }) {
  const color = NODE_COLORS[type] || 'bg-gray-500'
  const label = NODE_LABELS[type] || type
  const icon = NODE_ICONS[type] || '▪'

  return (
    <div className={`flow-node ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      {/* Target handle (top) */}
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-gray-400" />

      {/* Header */}
      <div className={`node-header ${color}`}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>

      {/* Body */}
      <div className="node-body">
        {children}
      </div>

      {/* Default source handle (bottom) - only for non-choice/condition */}
      {!extraHandles && (
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-gray-400" />
      )}

      {/* Extra handles (for choice/condition) */}
      {extraHandles}
    </div>
  )
}
