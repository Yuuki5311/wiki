import { useEffect } from 'react'
import Graph from 'graphology'
import { SigmaContainer, useLoadGraph, useRegisterEvents } from '@react-sigma/core'
import '@react-sigma/core/lib/react-sigma.min.css'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { useGraphStore } from '@/stores/graph-store'
import { Loader2, RefreshCw } from 'lucide-react'

const NODE_COLOR = '#60a5fa'
const EDGE_COLOR = '#94a3b8'

function GraphLoader({ onNodeClick }: { onNodeClick: (id: string) => void }) {
  const loadGraph = useLoadGraph()
  const registerEvents = useRegisterEvents()
  const graph = useGraphStore(s => s.graph)

  useEffect(() => {
    if (!graph) return
    const g = new Graph({ type: 'directed' })
    for (const node of graph.nodes) {
      g.addNode(node.id, {
        label: node.title,
        size: 10,
        color: NODE_COLOR,
        x: Math.random(),
        y: Math.random(),
      })
    }
    for (const edge of graph.edges) {
      if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
        g.addEdge(edge.source, edge.target, {
          label: edge.relation,
          color: EDGE_COLOR,
          size: 2,
        })
      }
    }
    if (graph.nodes.length > 0) {
      forceAtlas2.assign(g, { iterations: 100, settings: { gravity: 1 } })
    }
    loadGraph(g)
  }, [graph, loadGraph])

  useEffect(() => {
    registerEvents({
      clickNode: (payload) => onNodeClick(payload.node),
    })
  }, [registerEvents, onNodeClick])

  return null
}

interface GraphViewProps {
  onNodeClick: (pageId: string) => void
}

export function GraphView({ onNodeClick }: GraphViewProps) {
  const { graph, loading, error, fetchGraph } = useGraphStore()

  useEffect(() => {
    fetchGraph()
  }, [fetchGraph])

  if (loading && !graph) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        加载图谱中...
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3">
        <p>加载失败：{error}</p>
        <button onClick={fetchGraph} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
          <RefreshCw size={14} /> 重试
        </button>
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        知识库暂无内容，请先导入文档
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <SigmaContainer
        style={{ width: '100%', height: '100%', background: '#0f172a' }}
        settings={{ renderEdgeLabels: true, defaultEdgeType: 'arrow', labelColor: { color: '#9ca3af' } }}
      >
        <GraphLoader onNodeClick={onNodeClick} />
      </SigmaContainer>
    </div>
  )
}
