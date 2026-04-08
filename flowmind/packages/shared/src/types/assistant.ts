import type { Graph } from './graph';

export interface Assistant {
  id: string;
  name: string;
  description?: string;
  storyText?: string;
  status: 'draft' | 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
  graph: Graph;
  /**
   * Cloud-publish state. Populated after a successful POST /api/publish so the
   * Deploy panel can show the immutable public URL and version. Each publish
   * creates a new id, so we always store the latest one here for the share UI.
   */
  cloudPublishId?: string;
  cloudVersion?: number;
  cloudPublishedAt?: number;
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
