import React from 'react'
import BaseNode from './BaseNode.jsx'

export default function RAGQueryNode(props) {
  const { data } = props
  return (
    <BaseNode {...props} type="rag_query">
      <p className="text-gray-700 text-xs truncate max-w-[200px]">
        Query: {data.query_template || '{{user_input}}'}
      </p>
      <div className="flex gap-2 mt-1 text-xs">
        <span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">
          top_k: {data.top_k || 3}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 truncate max-w-[100px]">
          → {data.context_slot || 'rag_context'}
        </span>
      </div>
    </BaseNode>
  )
}
