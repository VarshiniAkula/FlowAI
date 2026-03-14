import React, { useState, useEffect, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import FlowCanvas from './components/canvas/FlowCanvas.jsx'
import PropertiesPanel from './components/panels/PropertiesPanel.jsx'
import DocumentLibrary from './components/panels/DocumentLibrary.jsx'
import TopBar from './components/toolbar/TopBar.jsx'
import GenerateModal from './components/toolbar/GenerateModal.jsx'
import StoryWriter from './components/rasa/StoryWriter.jsx'
import FileViewer from './components/rasa/FileViewer.jsx'
import TrainPanel from './components/rasa/TrainPanel.jsx'
import useFlowStore from './hooks/useFlowStore.js'
import apiClient from './utils/apiClient.js'
import { deserializeFlow } from './utils/flowDeserializer.js'
import { NODE_COLORS, NODE_LABELS, NODE_ICONS } from './utils/nodeDefaults.js'

const NODE_TYPES_LIST = ['message', 'input', 'choice', 'condition', 'rag_query', 'llm_response']

// ── Shared Components ─────────────────────────────────────────────────────────

function FlowSelector({ flows, activeFlowId, onSelect, onNew }) {
  return (
    <div className="px-3 py-2 border-b border-gray-200">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Flows</span>
        <button onClick={onNew} className="text-xs text-blue-500 hover:text-blue-700">+ New</button>
      </div>
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {flows.map((flow) => (
          <button key={flow.id} onClick={() => onSelect(flow.id)}
            className={`text-left text-xs px-2 py-1.5 rounded truncate transition-colors ${
              flow.id === activeFlowId ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {flow.name || flow.id}
          </button>
        ))}
        {flows.length === 0 && <p className="text-xs text-gray-400 px-2 py-1">No flows yet</p>}
      </div>
    </div>
  )
}

function NodePaletteItems() {
  return NODE_TYPES_LIST.map((type) => {
    const onDragStart = (e) => {
      e.dataTransfer.setData('application/flowai-node-type', type)
      e.dataTransfer.effectAllowed = 'move'
    }
    return (
      <div key={type} draggable onDragStart={onDragStart}
        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab border border-gray-200 bg-white hover:shadow-md transition-shadow select-none">
        <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs ${NODE_COLORS[type]}`}>
          {NODE_ICONS[type]}
        </div>
        <span className="text-xs text-gray-700 font-medium">{NODE_LABELS[type]}</span>
      </div>
    )
  })
}

// ── Flow Builder View ─────────────────────────────────────────────────────────

function FlowBuilderView({ flows, flowId, onSelectFlow, onNewFlow }) {
  const [tab, setTab] = useState('nodes')

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel */}
      <div className="w-52 h-full flex flex-col bg-gray-50 border-r border-gray-200">
        <FlowSelector flows={flows} activeFlowId={flowId} onSelect={onSelectFlow} onNew={onNewFlow} />
        <div className="flex border-b border-gray-200">
          {['nodes', 'docs'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 text-xs py-2 transition-colors ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'nodes' ? 'Nodes' : 'Documents'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === 'nodes' ? (
            <div className="h-full overflow-y-auto p-3 flex flex-col gap-2"><NodePaletteItems /></div>
          ) : (
            <DocumentLibrary onDocumentsChange={() => {}} />
          )}
        </div>
      </div>
      <FlowCanvas />
      <PropertiesPanel />
    </div>
  )
}

// ── RASA Story Builder View ───────────────────────────────────────────────────

function RasaBuilderView() {
  const [generatedData, setGeneratedData] = useState(null)
  const [rasaProjects, setRasaProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/rasa/projects')
      setRasaProjects(data)
    } catch (err) {
      console.error('Failed to fetch RASA projects:', err)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const handleGenerated = (data) => {
    setGeneratedData(data)
    setSelectedProject(data.project_id)
    fetchProjects()
  }

  const loadProject = async (projectId) => {
    try {
      const { data } = await apiClient.get(`/rasa/projects/${projectId}/files`)
      setGeneratedData({ project_id: projectId, files: data.files, warnings: [] })
      setSelectedProject(projectId)
    } catch (err) {
      console.error('Failed to load project:', err)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Story Writer + Project List */}
      <div className="w-80 h-full flex flex-col border-r border-gray-200 bg-gray-50">
        {rasaProjects.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Projects</span>
            <div className="flex flex-col gap-1 mt-1.5 max-h-32 overflow-y-auto">
              {rasaProjects.map((p) => (
                <button key={p.project_id} onClick={() => loadProject(p.project_id)}
                  className={`text-left text-xs px-2 py-1.5 rounded truncate transition-colors ${
                    selectedProject === p.project_id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                  {p.project_id}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <StoryWriter onGenerated={handleGenerated} />
        </div>
      </div>

      {/* Center: File Viewer */}
      <div className="flex-1 h-full flex flex-col bg-white">
        {generatedData ? (
          <FileViewer
            projectId={generatedData.project_id}
            files={generatedData.files}
            warnings={generatedData.warnings}
            onFilesChange={(files) => setGeneratedData({ ...generatedData, files })}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">&#128221;</div>
              <p className="text-sm">Write a story to generate RASA files</p>
              <p className="text-xs text-gray-300 mt-1">Or select an existing project</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Train & Launch */}
      <div className="w-72 h-full border-l border-gray-200 bg-white">
        {generatedData ? (
          <TrainPanel
            projectId={generatedData.project_id}
            onLaunched={(data) => console.log('Assistant launched:', data)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400 text-center px-4">
              Generate files first to train and launch
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('rasa')
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [flows, setFlows] = useState([])
  const { flowId, loadFlow } = useFlowStore()

  const fetchFlows = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/flows')
      setFlows(data)
    } catch (err) {
      console.error('Failed to fetch flows:', err)
    }
  }, [])

  useEffect(() => { fetchFlows() }, [fetchFlows])

  const selectFlow = useCallback(async (id) => {
    try {
      const { data } = await apiClient.get(`/flows/${id}`)
      const { nodes, edges } = await deserializeFlow(data.definition)
      loadFlow(nodes, edges, { flowId: data.id, flowName: data.name, flowDescription: data.description })
    } catch (err) {
      console.error('Failed to load flow:', err)
    }
  }, [loadFlow])

  const newFlow = useCallback(() => {
    loadFlow([], [], { flowId: null, flowName: 'Untitled Flow', flowDescription: '' })
  }, [loadFlow])

  return (
    <ReactFlowProvider>
      <div className="w-screen h-screen flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">F</div>
            <span className="text-sm font-semibold text-gray-800">FlowAI</span>
          </div>

          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('rasa')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                view === 'rasa' ? 'bg-white text-blue-600 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}>
              Story Builder
            </button>
            <button onClick={() => setView('flow')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                view === 'flow' ? 'bg-white text-blue-600 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}>
              Flow Canvas
            </button>
          </div>

          <div className="flex-1" />

          {view === 'flow' && <TopBar onGenerate={() => setShowGenerateModal(true)} />}
        </div>

        {/* Main content */}
        {view === 'rasa' ? (
          <RasaBuilderView />
        ) : (
          <FlowBuilderView flows={flows} flowId={flowId} onSelectFlow={selectFlow} onNewFlow={newFlow} />
        )}
      </div>

      {showGenerateModal && (
        <GenerateModal onClose={() => { setShowGenerateModal(false); fetchFlows() }} availableDocIds={[]} />
      )}
    </ReactFlowProvider>
  )
}
