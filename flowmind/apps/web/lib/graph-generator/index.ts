import { GoogleGenerativeAI } from '@google/generative-ai';
import { STORY_TO_GRAPH_PROMPT, type GeneratedGraph } from './prompt';
import { generateHeuristicGraph } from './heuristic';

export type GenerationSource = 'gemini' | 'heuristic';

export interface GenerationResult {
  graph: GeneratedGraph;
  source: GenerationSource;
}

const VALID_NODE_TYPES = new Set([
  'message',
  'input',
  'choice',
  'condition',
  'rag_query',
  'llm_response',
]);

/**
 * Generate a flow graph from a natural-language story.
 *
 * Tries Gemini first when GEMINI_API_KEY is set. Falls back to a deterministic
 * heuristic generator on error or when no key is configured.
 */
export async function generateGraphFromStory(
  story: string,
): Promise<GenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const graph = await callGemini(story, apiKey);
      const validated = validateGraph(graph);
      return { graph: validated, source: 'gemini' };
    } catch (err) {
      console.warn('[graph-generator] Gemini call failed, using heuristic:', err);
    }
  }

  return { graph: generateHeuristicGraph(story), source: 'heuristic' };
}

async function callGemini(story: string, apiKey: string): Promise<GeneratedGraph> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  const result = await model.generateContent(STORY_TO_GRAPH_PROMPT + story);
  const text = result.response.text();

  try {
    return JSON.parse(text) as GeneratedGraph;
  } catch (err) {
    throw new Error(`Failed to parse Gemini response as JSON: ${err}`);
  }
}

function validateGraph(graph: GeneratedGraph): GeneratedGraph {
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
