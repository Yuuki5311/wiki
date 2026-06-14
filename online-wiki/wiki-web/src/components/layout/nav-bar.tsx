import { Network, FileText, Upload } from 'lucide-react'

type View = 'graph' | 'pages'

interface NavBarProps {
  view: View
  onViewChange: (v: View) => void
  onIngestOpen: () => void
}

export function NavBar({ view, onViewChange, onIngestOpen }: NavBarProps) {
  return (
    <nav className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
      <span className="font-semibold text-white mr-4">Wiki 知识库</span>
      <button
        onClick={() => onViewChange('graph')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
          view === 'graph' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        <Network size={15} />
        图谱
      </button>
      <button
        onClick={() => onViewChange('pages')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
          view === 'pages' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        <FileText size={15} />
        页面
      </button>
      <button
        onClick={onIngestOpen}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white transition-colors"
      >
        <Upload size={15} />
        导入
      </button>
    </nav>
  )
}
