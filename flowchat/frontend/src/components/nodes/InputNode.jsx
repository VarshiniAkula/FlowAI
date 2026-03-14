import React from 'react'
import BaseNode from './BaseNode.jsx'

export default function InputNode(props) {
  const { data } = props
  return (
    <BaseNode {...props} type="input">
      <p className="text-gray-700 truncate max-w-[200px]">{data.text || 'Input prompt'}</p>
      {data.slot && (
        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs">
          → {data.slot}
        </span>
      )}
    </BaseNode>
  )
}
