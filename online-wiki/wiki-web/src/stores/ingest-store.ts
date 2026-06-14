import { create } from 'zustand'
import { submitIngest, getJobStatus, type JobStatus } from '@/api/wiki-api'

interface IngestState {
  jobId: string | null
  status: JobStatus | null
  submitting: boolean
  error: string | null
  submit: (fileName: string, content: string) => Promise<void>
  reset: () => void
}

export const useIngestStore = create<IngestState>((set) => ({
  jobId: null,
  status: null,
  submitting: false,
  error: null,

  submit: async (fileName: string, content: string) => {
    set({ submitting: true, error: null, jobId: null, status: null })
    try {
      const jobId = await submitIngest(fileName, content)
      set({ jobId, status: { status: 'queued' }, submitting: false })

      let attempts = 0
      const interval = setInterval(async () => {
        attempts++
        try {
          const s = await getJobStatus(jobId)
          set({ status: s })
          if (s.status === 'done' || s.status === 'error' || attempts >= 24) {
            clearInterval(interval)
          }
        } catch {
          clearInterval(interval)
        }
      }, 5000)
    } catch (e) {
      set({ error: String(e), submitting: false })
    }
  },

  reset: () => set({ jobId: null, status: null, submitting: false, error: null }),
}))
