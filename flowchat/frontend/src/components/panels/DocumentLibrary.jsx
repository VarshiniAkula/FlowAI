import React, { useState, useEffect, useCallback } from 'react'
import apiClient from '../../utils/apiClient.js'

function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-700',
    indexed: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

export default function DocumentLibrary({ onDocumentsChange }) {
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)

  const fetchDocuments = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/rag/documents')
      setDocuments(data)
      if (onDocumentsChange) onDocumentsChange(data)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }, [onDocumentsChange])

  useEffect(() => {
    fetchDocuments()
    // Poll for status updates on pending documents
    const interval = setInterval(() => {
      const hasPending = documents.some((d) => d.status === 'pending')
      if (hasPending) fetchDocuments()
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchDocuments, documents])

  const onDrop = useCallback(async (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || e.target?.files || [])
    if (!files.length) return

    setUploading(true)
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        await apiClient.post('/rag/documents', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err)
      }
    }
    setUploading(false)
    fetchDocuments()
  }, [fetchDocuments])

  const deleteDoc = useCallback(async (docId) => {
    try {
      await apiClient.delete(`/rag/documents/${docId}`)
      fetchDocuments()
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }, [fetchDocuments])

  return (
    <div className="flex flex-col h-full">
      {/* Upload zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="m-3 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
        onClick={() => document.getElementById('doc-file-input').click()}
      >
        <input
          id="doc-file-input"
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={onDrop}
        />
        {uploading ? (
          <p className="text-xs text-blue-600">Uploading...</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">Drop files or click to upload</p>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT, MD</p>
          </>
        )}
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-3">
        {documents.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No documents uploaded yet</p>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 truncate">{doc.original_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={doc.status} />
                  {doc.status === 'indexed' && (
                    <span className="text-xs text-gray-400">{doc.chunk_count} chunks</span>
                  )}
                </div>
                {doc.error_message && (
                  <p className="text-xs text-red-500 mt-0.5 truncate">{doc.error_message}</p>
                )}
                <p className="text-xs text-gray-300 font-mono mt-0.5">{doc.id.slice(0, 8)}</p>
              </div>
              <button
                onClick={() => deleteDoc(doc.id)}
                className="ml-2 text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
              >✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
