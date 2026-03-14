import React from 'react'
import { Handle, Position } from '@xyflow/react'
import BaseNode from './BaseNode.jsx'

export default function ChoiceNode(props) {
  const { data } = props
  const choices = Object.keys(data.choices || {})

  const extraHandles = (
    <div className="relative flex justify-around pb-1">
      {choices.map((label, idx) => {
        const xPct = choices.length === 1 ? 50 : (idx / (choices.length - 1)) * 100
        return (
          <Handle
            key={label}
            id={`choice-${label}`}
            type="source"
            position={Position.Bottom}
            style={{ left: `${xPct}%`, bottom: -6 }}
            className="!w-2.5 !h-2.5 !bg-violet-400"
          />
        )
      })}
      {/* Default handle */}
      <Handle
        id="choice-default"
        type="source"
        position={Position.Bottom}
        style={{ right: -6, top: '50%' }}
        className="!w-2.5 !h-2.5 !bg-gray-300"
      />
    </div>
  )

  return (
    <BaseNode {...props} type="choice" extraHandles={extraHandles}>
      <p className="text-gray-700 truncate max-w-[200px]">{data.text || 'Choose an option'}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {choices.map((label) => (
          <span key={label} className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-xs">
            {label}
          </span>
        ))}
      </div>
    </BaseNode>
  )
}
