import { create } from 'zustand';
import { submitIngest, getJobStatus } from '@/api/wiki-api';
export const useIngestStore = create((set) => ({
    jobId: null,
    status: null,
    submitting: false,
    error: null,
    submit: async (fileName, content) => {
        set({ submitting: true, error: null, jobId: null, status: null });
        try {
            const jobId = await submitIngest(fileName, content);
            set({ jobId, status: { status: 'queued' }, submitting: false });
            let attempts = 0;
            const interval = setInterval(async () => {
                attempts++;
                try {
                    const s = await getJobStatus(jobId);
                    set({ status: s });
                    if (s.status === 'done' || s.status === 'error' || attempts >= 24) {
                        clearInterval(interval);
                    }
                }
                catch {
                    clearInterval(interval);
                }
            }, 5000);
        }
        catch (e) {
            set({ error: String(e), submitting: false });
        }
    },
    reset: () => set({ jobId: null, status: null, submitting: false, error: null }),
}));
