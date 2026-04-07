import type { Graph } from './graph.js';

export interface Assistant {
  id: string;
  name: string;
  description?: string;
  storyText?: string;
  status: 'draft' | 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
  graph: Graph;
}

export interface KnowledgeSource {
  id: string;
  assistantId: string;
  type: 'website' | 'sitemap' | 'upload';
  name: string;
  status: 'pending' | 'crawling' | 'parsing' | 'indexing' | 'ready' | 'error';
  errorMessage?: string;
  chunkCount?: number;
  createdAt: number;
}
