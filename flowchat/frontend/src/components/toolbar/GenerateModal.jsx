import React, { useState } from 'react'
import apiClient from '../../utils/apiClient.js'
import useFlowStore from '../../hooks/useFlowStore.js'
import { deserializeFlow } from '../../utils/flowDeserializer.js'

export default function GenerateModal({ onClose, availableDocIds = [] }) {
  const [prompt, setPrompt] = useState('')
  const [useDocuments, setUseDocuments] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { loadFlow, setFlowMeta } = useFlowStore()

  const toggleDoc = (docId) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((d) => d !== docId) : [...prev, docId]
    )
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const body = {
        prompt: prompt.trim(),
        doc_ids: useDocuments && selectedDocIds.length > 0 ? selectedDocIds : null,
      }
      const { data } = await apiClient.post('/generate/flow', body)
      const flow = data.flow
      const { nodes, edges } = await deserializeFlow(flow)
      loadFlow(nodes, edges, {
        flowId: flow.id,
        flowName: flow.description || flow.id,
        flowDescription: flow.description || '',
      })
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Generate Flow from Description</h2>
            <p className="text-xs text-gray-500 mt-0.5">Describe your assistant and AI will build the flow</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Describe your assistant
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Example: Build a customer support bot that greets users, asks about their issue type (billing, technical, or account), collects contact information, and routes them to the appropriate department with a confirmation message."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />

          {availableDocIds.length > 0 && (
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDocuments}
                  onChange={(e) => setUseDocuments(e.target.checked)}
                  className="rounded"
                />
                Use uploaded documents for RAG-enhanced flow
              </label>
              {useDocuments && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableDocIds.map((docId) => (
                    <button
                      key={docId}
                      onClick={() => toggleDoc(docId)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${
                        selectedDocIds.includes(docId)
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}
                    >
                      {docId.slice(0, 8)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Generating...
              </>
            ) : '✨ Generate Flow'}
          </button>
        </div>
      </div>
    </div>
  )
}
