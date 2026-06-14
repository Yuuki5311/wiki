import { useEffect, useState } from 'react'
import { usePageStore } from '@/stores/page-store'
import { Search, Loader2, FileText, Trash2 } from 'lucide-react'

interface PageListProps {
  onPageSelect: (pageId: string) => void
}

export function PageList({ onPageSelect }: PageListProps) {
  const { pages, searchResults, loading, fetchPages, search, clearSearch, deletePage } = usePageStore()
  const [query, setQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      search(query.trim())
    } else {
      clearSearch()
    }
  }

  const handleDelete = async (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation()
    if (!confirm(`确认删除页面？\n${pageId}`)) return
    setDeletingId(pageId)
    await deletePage(pageId)
    setDeletingId(null)
  }

  const displayItems = searchResults ?? pages.map(p => ({ path: p.path, title: p.title, excerpt: '', score: 0 }))

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              if (!e.target.value) clearSearch()
            }}
            placeholder="搜索知识库..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button type="submit" className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white">
            <Search size={15} />
          </button>
        </form>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center p-8 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={16} /> 加载中...
          </div>
        )}
        {!loading && displayItems.length === 0 && (
          <div className="text-center p-8 text-gray-500">暂无页面</div>
        )}
        {displayItems.map(item => (
          <div
            key={item.path}
            className="group flex items-center border-b border-gray-800 hover:bg-gray-800 transition-colors"
          >
            <button
              onClick={() => onPageSelect(item.path)}
              className="flex-1 text-left px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-gray-500 shrink-0" />
                <span className="text-sm text-white">{item.title}</span>
              </div>
              {item.excerpt && (
                <p className="text-xs text-gray-500 mt-1 pl-5 line-clamp-2">{item.excerpt}</p>
              )}
            </button>
            <button
              onClick={e => handleDelete(e, item.path)}
              disabled={deletingId === item.path}
              className="opacity-0 group-hover:opacity-100 px-3 py-3 text-gray-500 hover:text-red-400 transition-all disabled:opacity-50"
              title="删除页面"
            >
              {deletingId === item.path
                ? <Loader2 size={14} className="animate-spin" />
                : <Trash2 size={14} />
              }
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
