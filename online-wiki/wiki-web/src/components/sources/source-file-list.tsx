import { useEffect, useState } from 'react'
import { Loader2, FileInput } from 'lucide-react'
import { listSourceFiles } from '@/api/wiki-api'

interface SourceFileListProps {
  onFileSelect: (fileName: string) => void
}

export function SourceFileList({ onFileSelect }: SourceFileListProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    listSourceFiles()
      .then(f => setFiles(f))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={16} /> 加载中...
      </div>
    )
  }

  if (error) {
    return <div className="p-8 text-red-400 text-sm">{error}</div>
  }

  if (files.length === 0) {
    return <div className="text-center p-8 text-gray-500">暂无原文件</div>
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {files.map(fileName => (
        <button
          key={fileName}
          onClick={() => onFileSelect(fileName)}
          className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 hover:bg-gray-800 text-left transition-colors"
        >
          <FileInput size={14} className="text-gray-500 shrink-0" />
          <span className="text-sm text-white">{fileName}</span>
        </button>
      ))}
    </div>
  )
}
