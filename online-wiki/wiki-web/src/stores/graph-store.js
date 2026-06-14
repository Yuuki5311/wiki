import { create } from 'zustand';
import { fetchGraph, saveGraph } from '@/api/graph-api';
export const useGraphStore = create((set, get) => ({
    graph: null,
    loading: false,
    error: null,
    fetchGraph: async () => {
        set({ loading: true, error: null });
        try {
            const graph = await fetchGraph();
            set({ graph, loading: false });
        }
        catch (e) {
            set({ error: String(e), loading: false });
        }
    },
    addEdge: async (source, target, relation) => {
        const { graph } = get();
        if (!graph)
            return;
        const newEdge = { source, target, relation, sourceType: 'link' };
        const updated = { ...graph, edges: [...graph.edges, newEdge] };
        set({ graph: updated });
        await saveGraph(updated);
    },
    removeEdge: async (source, target) => {
        const { graph } = get();
        if (!graph)
            return;
        const updated = {
            ...graph,
            edges: graph.edges.filter(e => !(e.source === source && e.target === target)),
        };
        set({ graph: updated });
        await saveGraph(updated);
    },
}));
