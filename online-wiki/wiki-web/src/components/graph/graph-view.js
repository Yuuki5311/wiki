import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import Graph from 'graphology';
import { SigmaContainer, useLoadGraph, useRegisterEvents } from '@react-sigma/core';
import '@react-sigma/core/lib/react-sigma.min.css';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { useGraphStore } from '@/stores/graph-store';
import { Loader2, RefreshCw } from 'lucide-react';
const NODE_COLOR = '#60a5fa';
const EDGE_COLOR = '#94a3b8';
function GraphLoader({ onNodeClick }) {
    const loadGraph = useLoadGraph();
    const registerEvents = useRegisterEvents();
    const graph = useGraphStore(s => s.graph);
    useEffect(() => {
        if (!graph)
            return;
        const g = new Graph({ type: 'directed' });
        for (const node of graph.nodes) {
            g.addNode(node.id, {
                label: node.title,
                size: 10,
                color: NODE_COLOR,
                x: Math.random(),
                y: Math.random(),
            });
        }
        for (const edge of graph.edges) {
            if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
                g.addEdge(edge.source, edge.target, {
                    label: edge.relation,
                    color: EDGE_COLOR,
                    size: 2,
                });
            }
        }
        if (graph.nodes.length > 0) {
            forceAtlas2.assign(g, { iterations: 100, settings: { gravity: 1 } });
        }
        loadGraph(g);
    }, [graph, loadGraph]);
    useEffect(() => {
        registerEvents({
            clickNode: (payload) => onNodeClick(payload.node),
        });
    }, [registerEvents, onNodeClick]);
    return null;
}
export function GraphView({ onNodeClick }) {
    const { graph, loading, error, fetchGraph } = useGraphStore();
    useEffect(() => {
        fetchGraph();
    }, [fetchGraph]);
    if (loading && !graph) {
        return (_jsxs("div", { className: "w-full h-full flex items-center justify-center text-gray-400", children: [_jsx(Loader2, { className: "animate-spin mr-2", size: 20 }), "\u52A0\u8F7D\u56FE\u8C31\u4E2D..."] }));
    }
    if (error) {
        return (_jsxs("div", { className: "w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3", children: [_jsxs("p", { children: ["\u52A0\u8F7D\u5931\u8D25\uFF1A", error] }), _jsxs("button", { onClick: fetchGraph, className: "flex items-center gap-1 text-blue-400 hover:text-blue-300", children: [_jsx(RefreshCw, { size: 14 }), " \u91CD\u8BD5"] })] }));
    }
    if (!graph || graph.nodes.length === 0) {
        return (_jsx("div", { className: "w-full h-full flex items-center justify-center text-gray-500", children: "\u77E5\u8BC6\u5E93\u6682\u65E0\u5185\u5BB9\uFF0C\u8BF7\u5148\u5BFC\u5165\u6587\u6863" }));
    }
    return (_jsx("div", { className: "w-full h-full", children: _jsx(SigmaContainer, { style: { width: '100%', height: '100%', background: '#0f172a' }, settings: { renderEdgeLabels: true, defaultEdgeType: 'arrow', labelColor: { color: '#9ca3af' } }, children: _jsx(GraphLoader, { onNodeClick: onNodeClick }) }) }));
}
