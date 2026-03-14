/**
 * FlowAI JSON → ReactFlow {nodes[], edges[]}
 * Uses a simple top-down layout via level-based positioning.
 */
import { getNodeDefault } from './nodeDefaults.js'

let _dagre = null
async function getDagre() {
  if (!_dagre) {
    _dagre = await import('@dagrejs/dagre')
  }
  return _dagre
}

function buildEdgesFromNode(flowNode, rfEdges) {
  const { id, type, next, choices, default: defaultNext, true_next, false_next } = flowNode

  if (type === 'choice') {
    Object.entries(choices || {}).forEach(([label, target], idx) => {
      if (target) {
        rfEdges.push({
          id: `${id}-choice-${idx}`,
          source: id,
          sourceHandle: `choice-${label}`,
          target,
          label,
          type: 'smoothstep',
        })
      }
    })
    if (defaultNext) {
      rfEdges.push({
        id: `${id}-default`,
        source: id,
        sourceHandle: 'choice-default',
        target: defaultNext,
        label: 'default',
        type: 'smoothstep',
        style: { strokeDasharray: '4 2' },
      })
    }
  } else if (type === 'condition') {
    if (true_next) {
      rfEdges.push({
        id: `${id}-true`,
        source: id,
        sourceHandle: 'true',
        target: true_next,
        label: 'true',
        type: 'smoothstep',
        style: { stroke: '#22c55e' },
      })
    }
    if (false_next) {
      rfEdges.push({
        id: `${id}-false`,
        source: id,
        sourceHandle: 'false',
        target: false_next,
        label: 'false',
        type: 'smoothstep',
        style: { stroke: '#ef4444' },
      })
    }
  } else if (next) {
    rfEdges.push({
      id: `${id}-next`,
      source: id,
      target: next,
      type: 'smoothstep',
    })
  }
}

export async function deserializeFlow(flowJSON) {
  if (!flowJSON || !flowJSON.nodes) {
    return { nodes: [], edges: [] }
  }

  const dagre = await getDagre()
  const dagreLib = dagre.default || dagre
  const g = new dagreLib.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })
  g.setDefaultEdgeLabel(() => ({}))

  const rfEdges = []
  const nodeWidth = 220
  const nodeHeight = 80

  // Add nodes to dagre
  Object.values(flowJSON.nodes).forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  // Add edges to dagre for layout
  Object.values(flowJSON.nodes).forEach((node) => {
    const { type, next, choices, default: defaultNext, true_next, false_next } = node
    buildEdgesFromNode(node, rfEdges)

    if (type === 'choice') {
      Object.values(choices || {}).forEach((target) => {
        if (target && flowJSON.nodes[target]) g.setEdge(node.id, target)
      })
      if (defaultNext && flowJSON.nodes[defaultNext]) g.setEdge(node.id, defaultNext)
    } else if (type === 'condition') {
      if (true_next && flowJSON.nodes[true_next]) g.setEdge(node.id, true_next)
      if (false_next && flowJSON.nodes[false_next]) g.setEdge(node.id, false_next)
    } else if (next && flowJSON.nodes[next]) {
      g.setEdge(node.id, next)
    }
  })

  dagreLib.layout(g)

  const rfNodes = Object.values(flowJSON.nodes).map((flowNode) => {
    const pos = g.node(flowNode.id)
    return {
      id: flowNode.id,
      type: flowNode.type || 'message',
      position: { x: pos ? pos.x - nodeWidth / 2 : 0, y: pos ? pos.y - nodeHeight / 2 : 0 },
      data: { ...getNodeDefault(flowNode.type), ...flowNode },
    }
  })

  return { nodes: rfNodes, edges: rfEdges }
}
