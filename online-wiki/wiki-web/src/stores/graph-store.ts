import { create } from 'zustand'
import { fetchGraph, saveGraph, type WikiGraph, type GraphEdge } from '@/api/graph-api'

interface GraphState {
  graph: WikiGraph | null
  loading: boolean
  error: string | null
  fetchGraph: () => Promise<void>
  addEdge: (source: string, target: string, relation: string) => Promise<void>
  removeEdge: (source: string, target: string) => Promise<void>
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: null,
  loading: false,
  error: null,

  fetchGraph: async () => {
    set({ loading: true, error: null })
    try {
      const graph = await fetchGraph()
      set({ graph, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  addEdge: async (source: string, target: string, relation: string) => {
    const { graph } = get()
    if (!graph) return
    const newEdge: GraphEdge = { source, target, relation, sourceType: 'link' }
    const updated: WikiGraph = { ...graph, edges: [...graph.edges, newEdge] }
    set({ graph: updated })
    await saveGraph(updated)
  },

  removeEdge: async (source: string, target: string) => {
    const { graph } = get()
    if (!graph) return
    const updated: WikiGraph = {
      ...graph,
      edges: graph.edges.filter(e => !(e.source === source && e.target === target)),
    }
    set({ graph: updated })
    await saveGraph(updated)
  },
}))
