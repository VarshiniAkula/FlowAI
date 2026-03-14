import React from 'react'
import BaseNode from './BaseNode.jsx'

export default function LLMResponseNode(props) {
  const { data } = props
  return (
    <BaseNode {...props} type="llm_response">
      <p className="text-gray-700 text-xs truncate max-w-[200px]">
        {data.user_template || 'User: {{user_input}}'}
      </p>
      <div className="flex gap-1 mt-1">
        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-xs truncate max-w-[120px]">
          {data.model || 'claude-sonnet-4-6'}
        </span>
      </div>
    </BaseNode>
  )
}
