import { STORY_TO_GRAPH_PROMPT, type GeneratedGraph } from './prompt';
import { generateHeuristicGraph } from './heuristic';

/**
 * Story-to-graph helpers.
 *
 * The Gemini call itself lives in `lib/gemini/client.ts` (centralized SDK).
 * This module owns the deterministic heuristic generator, the prompt, and the
 * validation/parse of model output — the pieces the `/api/generate-graph`
 * route composes based on the resolved credential mode.
 */

export type GenerationSource = 'gemini' | 'heuristic';

export { generateHeuristicGraph, STORY_TO_GRAPH_PROMPT };
export type { GeneratedGraph };

const VALID_NODE_TYPES = new Set([
  'message',
  'input',
  'choice',
  'condition',
  'rag_query',
  'llm_response',
]);

/** Parse raw model JSON into a validated graph. Throws on malformed output. */
export function parseGraphJson(text: string): GeneratedGraph {
  let graph: GeneratedGraph;
  try {
    graph = JSON.parse(text) as GeneratedGraph;
  } catch (err) {
    throw new Error(`Failed to parse model response as JSON: ${err}`);
  }
  return validateGraph(graph);
}

export function validateGraph(graph: GeneratedGraph): GeneratedGraph {
  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    throw new Error('Graph missing nodes array');
  }
  if (!graph.edges || !Array.isArray(graph.edges)) {
    throw new Error('Graph missing edges array');
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const node of graph.nodes) {
    if (!VALID_NODE_TYPES.has(node.type)) {
      throw new Error(`Invalid node type: ${node.type}`);
    }
    if (!node.id || typeof node.id !== 'string') {
      throw new Error(`Node missing valid id: ${JSON.stringify(node)}`);
    }
    if (!node.position || typeof node.position.x !== 'number') {
      node.position = { x: 0, y: 0 };
    }
    if (!node.label) node.label = node.id;
    if (!node.data) node.data = {};
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(`Edge ${edge.id} references unknown source ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`Edge ${edge.id} references unknown target ${edge.target}`);
    }
  }

  return graph;
}
