import { useRef, useState } from 'react'
import { useIngestStore } from '@/stores/ingest-store'
import { X, Loader2, CheckCircle, AlertCircle, Upload } from 'lucide-react'

interface IngestDialogProps {
  onClose: () => void
}

export function IngestDialog({ onClose }: IngestDialogProps) {
  const [fileName, setFileName] = useState('')
  const [content, setContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { submitting, status, error, submit, reset } = useIngestStore()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => setContent((ev.target?.result as string) ?? '')
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileName.trim() || !content.trim()) return
    await submit(fileName.trim(), content.trim())
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const isDone = status?.status === 'done'
  const isError = status?.status === 'error'
  const disabled = submitting || !!status

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-medium text-white">导入文档</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.markdown"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="w-full py-2 border border-dashed border-gray-600 rounded text-sm text-gray-400 hover:border-blue-500 hover:text-blue-400 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={14} />
            选择文件（.md / .txt）
          </button>
          <div>
            <label className="block text-xs text-gray-400 mb-1">文件名</label>
            <input
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              placeholder="document.md"
              disabled={disabled}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">文档内容</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="粘贴文档内容，或选择上方文件自动填充..."
              rows={8}
              disabled={disabled}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          {status && (
            <div className="text-xs text-gray-300 bg-gray-800 rounded p-3">
              {status.status === 'queued' && <span className="text-yellow-400">排队中...</span>}
              {status.status === 'processing' && (
                <span className="text-blue-400 flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  {status.step}
                </span>
              )}
              {isDone && status.status === 'done' && (
                <div className="text-green-400">
                  <div className="flex items-center gap-1 mb-1">
                    <CheckCircle size={12} /> 处理完成
                  </div>
                  <ul className="ml-4 text-gray-400">
                    {status.pagesWritten.map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}
              {isError && status.status === 'error' && (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertCircle size={12} /> {status.error}
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={handleClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white">
              {isDone ? '关闭' : '取消'}
            </button>
            {!status && (
              <button
                type="submit"
                disabled={submitting || !fileName.trim() || !content.trim()}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white flex items-center gap-1"
              >
                {submitting && <Loader2 size={12} className="animate-spin" />}
                提交
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

