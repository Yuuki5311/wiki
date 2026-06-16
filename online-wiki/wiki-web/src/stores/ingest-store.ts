import { create } from 'zustand'
import { submitIngest, getJobStatus, type JobStatus } from '@/api/wiki-api'
import { usePageStore } from './page-store'

interface IngestState {
  jobId: string | null
  status: JobStatus | null
  submitting: boolean
  error: string | null
  submit: (fileName: string, content: string) => Promise<void>
  reset: () => void
}

export const useIngestStore = create<IngestState>((set, get) => {
  // interval 保存在闭包里，reset() 和轮询结束时都能访问它
  let pollInterval: ReturnType<typeof setInterval> | null = null

  function stopPolling() {
    if (pollInterval !== null) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  return {
    jobId: null,
    status: null,
    submitting: false,
    error: null,

    submit: async (fileName: string, content: string) => {
      // 提交新任务前先停掉任何残留的旧轮询
      stopPolling()
      set({ submitting: true, error: null, jobId: null, status: null })

      try {
        const jobId = await submitIngest(fileName, content)
        set({ jobId, status: { status: 'queued' }, submitting: false })

        let attempts = 0
        pollInterval = setInterval(async () => {
          attempts++
          try {
            const s = await getJobStatus(jobId)
            // 只在 jobId 没变的情况下更新（防止关闭后重开导致状态错位）
            if (get().jobId === jobId) {
              set({ status: s })
            }

            if (s.status === 'done' || s.status === 'error' || attempts >= 24) {
              stopPolling()
              // 导入完成后刷新页面列表，让新页面立即出现
              if (s.status === 'done') {
                usePageStore.getState().fetchPages()
              }
            }
          } catch {
            stopPolling()
          }
        }, 5000)

      } catch (e) {
        set({ error: String(e), submitting: false })
      }
    },

    reset: () => {
      // 关闭对话框时停止轮询，防止后台继续发请求
      stopPolling()
      set({ jobId: null, status: null, submitting: false, error: null })
    },
  }
})
