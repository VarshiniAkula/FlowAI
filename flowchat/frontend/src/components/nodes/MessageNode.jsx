import React from 'react'
import BaseNode from './BaseNode.jsx'

export default function MessageNode(props) {
  const { data } = props
  return (
    <BaseNode {...props} type="message">
      <p className="text-gray-700 truncate max-w-[200px]">{data.text || 'No message set'}</p>
    </BaseNode>
  )
}
