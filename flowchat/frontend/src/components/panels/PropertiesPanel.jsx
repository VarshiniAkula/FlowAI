import React, { useCallback } from 'react'
import useFlowStore from '../../hooks/useFlowStore.js'
import { NODE_LABELS, NODE_ICONS } from '../../utils/nodeDefaults.js'

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function TextArea({ value, onChange, rows = 3 }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
    />
  )
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
  )
}

function MessageProperties({ data, update }) {
  return (
    <Field label="Message Text">
      <TextArea value={data.text} onChange={(v) => update({ text: v })} rows={4} />
    </Field>
  )
}

function InputProperties({ data, update }) {
  return (
    <>
      <Field label="Prompt Text">
        <TextArea value={data.text} onChange={(v) => update({ text: v })} rows={3} />
      </Field>
      <Field label="Context Slot (variable name)">
        <TextInput value={data.slot} onChange={(v) => update({ slot: v })} placeholder="e.g. user_email" />
      </Field>
    </>
  )
}

function ChoiceProperties({ data, update }) {
  const choices = data.choices || {}
  const keys = Object.keys(choices)

  const updateLabel = (oldKey, newKey) => {
    const updated = {}
    Object.entries(choices).forEach(([k, v]) => {
      updated[k === oldKey ? newKey : k] = v
    })
    update({ choices: updated })
  }

  const addChoice = () => {
    const newKey = `option_${keys.length + 1}`
    update({ choices: { ...choices, [newKey]: '' } })
  }

  const removeChoice = (key) => {
    const updated = { ...choices }
    delete updated[key]
    update({ choices: updated })
  }

  return (
    <>
      <Field label="Question Text">
        <TextArea value={data.text} onChange={(v) => update({ text: v })} rows={2} />
      </Field>
      <Field label="Choices">
        {keys.map((key) => (
          <div key={key} className="flex gap-1 mb-1">
            <input
              value={key}
              onChange={(e) => updateLabel(key, e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
              placeholder="label"
            />
            <button
              onClick={() => removeChoice(key)}
              className="px-2 text-red-400 hover:text-red-600 text-xs"
            >✕</button>
          </div>
        ))}
        <button
          onClick={addChoice}
          className="text-xs text-blue-500 hover:text-blue-700 mt-1"
        >+ Add choice</button>
      </Field>
      <Field label="Default (fallback) node id">
        <TextInput value={data.default} onChange={(v) => update({ default: v })} placeholder="node_id" />
      </Field>
    </>
  )
}

function ConditionProperties({ data, update }) {
  return (
    <>
      <Field label="Expression">
        <TextInput
          value={data.expression}
          onChange={(v) => update({ expression: v })}
          placeholder="context.value == 'expected'"
        />
        <p className="text-xs text-gray-400 mt-1">Use context.variable_name to access context values</p>
      </Field>
    </>
  )
}

function RAGQueryProperties({ data, update }) {
  return (
    <>
      <Field label="Query Template">
        <TextArea value={data.query_template} onChange={(v) => update({ query_template: v })} rows={2} />
        <p className="text-xs text-gray-400 mt-1">Use &#123;&#123;variable&#125;&#125; for context values</p>
      </Field>
      <Field label="Top K results">
        <input
          type="number"
          value={data.top_k || 3}
          onChange={(e) => update({ top_k: parseInt(e.target.value) || 3 })}
          min={1} max={10}
          className="w-20 text-xs border border-gray-200 rounded px-2 py-1"
        />
      </Field>
      <Field label="Context Slot (store results in)">
        <TextInput value={data.context_slot} onChange={(v) => update({ context_slot: v })} placeholder="rag_context" />
      </Field>
    </>
  )
}

function LLMResponseProperties({ data, update }) {
  return (
    <>
      <Field label="System Prompt">
        <TextArea value={data.system_prompt} onChange={(v) => update({ system_prompt: v })} rows={3} />
      </Field>
      <Field label="User Template">
        <TextArea value={data.user_template} onChange={(v) => update({ user_template: v })} rows={2} />
        <p className="text-xs text-gray-400 mt-1">Use &#123;&#123;variable&#125;&#125; for context values</p>
      </Field>
      <Field label="Model">
        <select
          value={data.model || 'claude-sonnet-4-6'}
          onChange={(e) => update({ model: e.target.value })}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5"
        >
          <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
          <option value="claude-opus-4-6">claude-opus-4-6</option>
          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
        </select>
      </Field>
      <Field label="Response Slot">
        <TextInput value={data.response_slot} onChange={(v) => update({ response_slot: v })} placeholder="llm_reply" />
      </Field>
    </>
  )
}

const PROPERTY_PANELS = {
  message: MessageProperties,
  input: InputProperties,
  choice: ChoiceProperties,
  condition: ConditionProperties,
  rag_query: RAGQueryProperties,
  llm_response: LLMResponseProperties,
}

export default function PropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeData, setSelectedNodeId, deleteNode } = useFlowStore()
  const node = nodes.find((n) => n.id === selectedNodeId)

  // useCallback must be called unconditionally (React Rules of Hooks)
  const update = useCallback((patch) => {
    if (!node) return
    updateNodeData(node.id, patch)
  }, [node?.id, updateNodeData])

  if (!node) {
    return (
      <div className="w-64 h-full bg-gray-50 border-l border-gray-200 flex items-center justify-center">
        <p className="text-xs text-gray-400 text-center px-4">Click a node to edit its properties</p>
      </div>
    )
  }

  const PropertiesComponent = PROPERTY_PANELS[node.type] || MessageProperties

  return (
    <div className="w-64 h-full bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-gray-700">
            {NODE_ICONS[node.type]} {NODE_LABELS[node.type]} Node
          </h3>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{node.id}</p>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >✕</button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4">
        <PropertiesComponent data={node.data} update={update} />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200">
        <button
          onClick={() => deleteNode(node.id)}
          className="w-full text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded px-3 py-1.5 transition-colors"
        >
          Delete Node
        </button>
      </div>
    </div>
  )
}
