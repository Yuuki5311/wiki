import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { getSourceFile } from '@/api/wiki-api'

interface SourceFileDetailProps {
  fileName: string
  onBack: () => void
}

export function SourceFileDetail({ fileName, onBack }: SourceFileDetailProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setContent(null)
    setError(null)
    getSourceFile(fileName)
      .then(c => setContent(c))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [fileName])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors"
          title="返回"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm text-white font-medium">{fileName}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center text-gray-400">
            <Loader2 className="animate-spin mr-2" size={16} /> 加载中...
          </div>
        )}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {content !== null && (
          <pre className="text-sm text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}
