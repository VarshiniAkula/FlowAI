import React, { useState } from 'react'
import useFlowStore from '../../hooks/useFlowStore.js'
import { serializeFlow } from '../../utils/flowSerializer.js'
import apiClient from '../../utils/apiClient.js'

export default function TopBar({ onGenerate }) {
  const {
    nodes, edges,
    flowId, flowName, flowDescription,
    setFlowMeta, isSaving, setSaving, setSaveError, saveError,
  } = useFlowStore()

  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const flowDef = serializeFlow(nodes, edges, { flowId, flowName, flowDescription })
      const id = flowId || flowDef.id || 'untitled_flow'

      // Try PUT first, then POST if not found
      try {
        await apiClient.put(`/flows/${id}`, {
          name: flowName,
          description: flowDescription,
          definition: flowDef,
          start_node: flowDef.start_node,
        })
      } catch (putErr) {
        if (putErr.response?.status === 404) {
          await apiClient.post('/flows', {
            id,
            name: flowName,
            description: flowDescription,
            definition: flowDef,
            start_node: flowDef.start_node,
          })
          setFlowMeta({ flowId: id })
        } else {
          throw putErr
        }
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = () => {
    const flowDef = serializeFlow(nodes, edges, { flowId, flowName, flowDescription })
    const blob = new Blob([JSON.stringify(flowDef, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${flowId || 'flow'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Flow name editor */}
      <input
        value={flowName}
        onChange={(e) => setFlowMeta({ flowName: e.target.value })}
        className="max-w-xs text-sm text-gray-700 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none px-1 py-0.5"
        placeholder="Untitled Flow"
      />

      <div className="flex-1" />

      {/* Error */}
      {saveError && (
        <span className="text-xs text-red-500 mr-2">{saveError}</span>
      )}

      {/* Generate button */}
      <button
        onClick={onGenerate}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
      >
        ✨ Generate
      </button>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
          saved
            ? 'bg-green-100 text-green-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        } disabled:opacity-50`}
      >
        {isSaving ? 'Saving...' : saved ? '✓ Saved' : '💾 Save'}
      </button>

      {/* Export */}
      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
      >
        ⬇ Export
      </button>
    </>
  )
}
