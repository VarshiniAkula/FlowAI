import React from 'react'
import { Handle, Position } from '@xyflow/react'
import BaseNode from './BaseNode.jsx'

export default function ConditionNode(props) {
  const { data } = props

  const extraHandles = (
    <>
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '30%' }}
        className="!w-2.5 !h-2.5 !bg-green-500"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '70%' }}
        className="!w-2.5 !h-2.5 !bg-red-400"
      />
    </>
  )

  return (
    <BaseNode {...props} type="condition" extraHandles={extraHandles}>
      <p className="text-gray-600 font-mono text-xs truncate max-w-[200px]">
        {data.expression || 'condition expression'}
      </p>
      <div className="flex gap-2 mt-1 text-xs">
        <span className="text-green-600">✓ true</span>
        <span className="text-red-500">✗ false</span>
      </div>
    </BaseNode>
  )
}
