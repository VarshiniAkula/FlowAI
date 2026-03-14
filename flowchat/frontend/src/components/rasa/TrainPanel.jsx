import React, { useState, useEffect, useRef } from 'react'
import apiClient from '../../utils/apiClient.js'

export default function TrainPanel({ projectId, onLaunched }) {
  const [training, setTraining] = useState(false)
  const [trainResult, setTrainResult] = useState(null)
  const [launching, setLaunching] = useState(false)
  const [launchResult, setLaunchResult] = useState(null)
  const [port, setPort] = useState(5005)
  const [logs, setLogs] = useState([])
  const logsRef = useRef(null)

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  const handleTrain = async () => {
    setTraining(true)
    setTrainResult(null)
    setLogs(['Starting training...'])
    try {
      const { data } = await apiClient.post('/rasa/train', { project_id: projectId }, { timeout: 600000 })
      setTrainResult(data)
      setLogs(data.logs || [])
    } catch (err) {
      setTrainResult({ success: false, logs: [err.response?.data?.detail || 'Training failed'] })
      setLogs([err.response?.data?.detail || 'Training failed. Is RASA installed?'])
    } finally {
      setTraining(false)
    }
  }

  const handleLaunch = async () => {
    setLaunching(true)
    setLaunchResult(null)
    try {
      const { data } = await apiClient.post('/rasa/launch', { project_id: projectId, port })
      setLaunchResult(data)
      if (data.success && onLaunched) {
        onLaunched(data)
      }
    } catch (err) {
      setLaunchResult({
        success: false,
        message: err.response?.data?.detail || 'Launch failed',
      })
    } finally {
      setLaunching(false)
    }
  }

  const handleStop = async () => {
    try {
      await apiClient.post(`/rasa/stop/${projectId}`)
      setLaunchResult(null)
    } catch (err) {
      console.error('Stop failed:', err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800">Train & Launch</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Approve the files, then train the model and launch your assistant.
        </p>
      </div>

      {/* Actions */}
      <div className="px-4 py-4 space-y-3">
        {/* Step 1: Train */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-gray-700">Step 1: Train Model</h4>
              <p className="text-xs text-gray-400 mt-0.5">
                Train RASA NLU and dialogue models from the generated files
              </p>
            </div>
            <button
              onClick={handleTrain}
              disabled={training}
              className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {training ? (
                <>
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Training...
                </>
              ) : 'Train'}
            </button>
          </div>
          {trainResult && (
            <div className={`mt-2 px-2 py-1.5 rounded text-xs ${
              trainResult.success
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600'
            }`}>
              {trainResult.success ? 'Training complete!' : 'Training failed.'}
              {trainResult.model_path && (
                <p className="font-mono text-xs mt-1 text-green-600 truncate">
                  Model: {trainResult.model_path}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Launch */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-gray-700">Step 2: Launch Assistant</h4>
              <p className="text-xs text-gray-400 mt-0.5">
                Start the trained assistant on a local port
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Port:</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 5005)}
                className="w-16 text-xs border border-gray-200 rounded px-2 py-1"
              />
              {launchResult?.success ? (
                <button
                  onClick={handleStop}
                  className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleLaunch}
                  disabled={launching || !trainResult?.success}
                  className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {launching ? 'Launching...' : 'Launch'}
                </button>
              )}
            </div>
          </div>
          {launchResult && (
            <div className={`mt-2 px-2 py-1.5 rounded text-xs ${
              launchResult.success
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600'
            }`}>
              {launchResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Training logs */}
      <div className="flex-1 flex flex-col min-h-0 px-4 pb-4">
        <h4 className="text-xs font-semibold text-gray-500 mb-1">Training Logs</h4>
        <div
          ref={logsRef}
          className="flex-1 bg-gray-900 rounded-lg p-3 overflow-y-auto font-mono text-xs text-gray-300"
        >
          {logs.length === 0 ? (
            <p className="text-gray-600">No logs yet. Click Train to start.</p>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={line.includes('ERROR') ? 'text-red-400' : ''}>
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
