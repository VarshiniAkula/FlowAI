'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Assistant, Graph } from '@flowmind/shared';

interface AssistantStore {
  assistants: Assistant[];
  createAssistant: (name: string, description?: string) => Assistant;
  updateAssistant: (id: string, patch: Partial<Assistant>) => void;
  deleteAssistant: (id: string) => void;
  getAssistant: (id: string) => Assistant | undefined;
  saveGraph: (id: string, graph: Graph) => void;
}

const emptyGraph = (): Graph => ({
  nodes: [],
  edges: [],
  variables: [],
});

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set, get) => ({
      assistants: [],
      createAssistant: (name, description) => {
        const now = Date.now();
        const assistant: Assistant = {
          id: nanoid(10),
          name,
          description,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          graph: emptyGraph(),
        };
        set((state) => ({ assistants: [assistant, ...state.assistants] }));
        return assistant;
      },
      updateAssistant: (id, patch) => {
        set((state) => ({
          assistants: state.assistants.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a,
          ),
        }));
      },
      deleteAssistant: (id) => {
        set((state) => ({
          assistants: state.assistants.filter((a) => a.id !== id),
        }));
      },
      getAssistant: (id) => get().assistants.find((a) => a.id === id),
      saveGraph: (id, graph) => {
        set((state) => ({
          assistants: state.assistants.map((a) =>
            a.id === id ? { ...a, graph, updatedAt: Date.now() } : a,
          ),
        }));
      },
    }),
    {
      name: 'flowmind-assistants',
      version: 1,
    },
  ),
);
