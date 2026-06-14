import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { usePageStore } from '@/stores/page-store'
import { ArrowLeft, Pencil, Save, X, Loader2 } from 'lucide-react'

interface PageDetailProps {
  onBack: () => void
}

export function PageDetail({ onBack }: PageDetailProps) {
  const { currentPageId, currentContent, loading, saveCurrent } = usePageStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const title = currentPageId?.replace(/^wiki\//, '').replace(/\.md$/, '') ?? ''

  const handleEdit = () => {
    setDraft(currentContent ?? '')
    setEditing(true)
  }

  const handleSave = async () => {
    await saveCurrent(draft)
    setEditing(false)
  }

  const handleCancel = () => {
    setEditing(false)
    setDraft('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-sm font-medium text-white">{title}</h1>
        {!editing ? (
          <button onClick={handleEdit} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
            <Pencil size={14} /> 编辑
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={loading} className="flex items-center gap-1 text-sm text-green-400 hover:text-green-300">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存
            </button>
            <button onClick={handleCancel} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
              <X size={14} /> 取消
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading && !currentContent ? (
          <div className="flex justify-center text-gray-400">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : editing ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full h-full min-h-[60vh] bg-gray-800 border border-gray-700 rounded p-4 text-sm text-white font-mono resize-none focus:outline-none focus:border-blue-500"
          />
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {currentContent ?? ''}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
