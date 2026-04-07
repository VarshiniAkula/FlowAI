'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { KnowledgeSource } from '@flowmind/shared';
import { chunkText } from './chunker';
import { searchChunks, type SearchHit } from './search';

export interface IndexedChunk {
  id: string;
  documentId: string;
  assistantId: string;
  index: number;
  text: string;
}

interface KnowledgeStore {
  documents: KnowledgeSource[];
  chunks: IndexedChunk[];

  addDocument: (
    assistantId: string,
    name: string,
    rawText: string,
  ) => KnowledgeSource;
  removeDocument: (id: string) => void;
  documentsForAssistant: (assistantId: string) => KnowledgeSource[];
  search: (assistantId: string, query: string, topK?: number) => SearchHit[];
}

export const useKnowledgeStore = create<KnowledgeStore>()(
  persist(
    (set, get) => ({
      documents: [],
      chunks: [],

      addDocument: (assistantId, name, rawText) => {
        const id = nanoid(10);
        const now = Date.now();
        const newChunks = chunkText(rawText).map((c) => ({
          id: `${id}_${c.index}`,
          documentId: id,
          assistantId,
          index: c.index,
          text: c.text,
        }));
        const doc: KnowledgeSource = {
          id,
          assistantId,
          type: 'upload',
          name,
          status: newChunks.length > 0 ? 'ready' : 'error',
          errorMessage: newChunks.length === 0 ? 'No text extracted' : undefined,
          chunkCount: newChunks.length,
          createdAt: now,
        };
        set((state) => ({
          documents: [doc, ...state.documents],
          chunks: [...state.chunks, ...newChunks],
        }));
        return doc;
      },

      removeDocument: (id) => {
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
          chunks: state.chunks.filter((c) => c.documentId !== id),
        }));
      },

      documentsForAssistant: (assistantId) =>
        get().documents.filter((d) => d.assistantId === assistantId),

      search: (assistantId, query, topK = 4) => {
        const scoped = get().chunks.filter((c) => c.assistantId === assistantId);
        return searchChunks(query, scoped, topK);
      },
    }),
    {
      name: 'flowmind-knowledge',
      version: 1,
    },
  ),
);
