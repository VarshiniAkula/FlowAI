import React, { useState } from 'react'
import apiClient from '../../utils/apiClient.js'

const FILE_TABS = [
  { key: 'nlu', label: 'nlu.yml', path: 'data/nlu.yml' },
  { key: 'stories', label: 'stories.yml', path: 'data/stories.yml' },
  { key: 'rules', label: 'rules.yml', path: 'data/rules.yml' },
  { key: 'domain', label: 'domain.yml', path: 'domain.yml' },
  { key: 'config', label: 'config.yml', path: 'config.yml' },
  { key: 'endpoints', label: 'endpoints.yml', path: 'endpoints.yml' },
  { key: 'actions', label: 'actions.py', path: 'actions/actions.py' },
]

export default function FileViewer({ projectId, files, warnings, onFilesChange }) {
  const [activeTab, setActiveTab] = useState('nlu')
  const [saving, setSaving] = useState(false)
  const [editedFiles, setEditedFiles] = useState({ ...files })

  const currentContent = editedFiles[activeTab] || ''
  const isDirty = currentContent !== files[activeTab]

  const handleEdit = (value) => {
    setEditedFiles((prev) => ({ ...prev, [activeTab]: value }))
  }

  const saveFile = async () => {
    setSaving(true)
    try {
      await apiClient.put(`/rasa/projects/${projectId}/files`, {
        file_key: activeTab,
        content: editedFiles[activeTab],
      })
      if (onFilesChange) {
        onFilesChange({ ...editedFiles })
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Generated RASA Files
          </h3>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{projectId}</p>
        </div>
        {isDirty && (
          <button
            onClick={saveFile}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700">&#9888; {w}</p>
          ))}
        </div>
      )}

      {/* File tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto px-2">
        {FILE_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-2 text-xs whitespace-nowrap transition-colors ${
              activeTab === key
                ? 'text-blue-600 border-b-2 border-blue-600 font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {editedFiles[key] !== files[key] && (
              <span className="ml-1 w-1.5 h-1.5 bg-orange-400 rounded-full inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* File path */}
      <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs text-gray-400 font-mono">
          {FILE_TABS.find((t) => t.key === activeTab)?.path}
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={currentContent}
          onChange={(e) => handleEdit(e.target.value)}
          className="w-full h-full p-4 text-xs font-mono bg-gray-900 text-green-300 resize-none focus:outline-none border-0"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
