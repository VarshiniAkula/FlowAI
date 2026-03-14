/**
 * ReactFlow {nodes[], edges[]} → FlowAI JSON
 */
export function serializeFlow(rfNodes, rfEdges, meta) {
  const { flowId, flowName, flowDescription } = meta

  // Build a lookup: source node id → edges from that node
  const edgesFrom = {}
  rfEdges.forEach((edge) => {
    if (!edgesFrom[edge.source]) edgesFrom[edge.source] = []
    edgesFrom[edge.source].push(edge)
  })

  const nodes = {}

  rfNodes.forEach((rfNode) => {
    const { id, type, data } = rfNode
    const outEdges = edgesFrom[id] || []

    // Build base node from data (strip React-internal fields)
    const node = { ...data }
    delete node.__rf  // remove any ReactFlow internals

    node.id = id
    node.type = type

    if (type === 'choice') {
      // Rebuild choices from edges with labels
      const choices = {}
      let defaultNext = node.default || ''
      outEdges.forEach((edge) => {
        const label = edge.label || edge.sourceHandle || 'option'
        if (label === 'default') {
          defaultNext = edge.target
        } else {
          choices[label] = edge.target
        }
      })
      node.choices = Object.keys(choices).length > 0 ? choices : (node.choices || {})
      node.default = defaultNext
    } else if (type === 'condition') {
      outEdges.forEach((edge) => {
        if (edge.label === 'true' || edge.sourceHandle === 'true') {
          node.true_next = edge.target
        } else if (edge.label === 'false' || edge.sourceHandle === 'false') {
          node.false_next = edge.target
        }
      })
    } else {
      // Single next
      node.next = outEdges.length > 0 ? outEdges[0].target : null
    }

    nodes[id] = node
  })

  // Determine start node: the one with no incoming edges
  const targetIds = new Set(rfEdges.map((e) => e.target))
  const startCandidates = rfNodes.filter((n) => !targetIds.has(n.id))
  const startNode = startCandidates.length > 0 ? startCandidates[0].id : (rfNodes[0]?.id || 'start')

  return {
    id: flowId || 'untitled_flow',
    description: flowDescription || '',
    start_node: startNode,
    nodes,
  }
}
