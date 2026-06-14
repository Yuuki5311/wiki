import { create } from 'zustand';
import { listPages, readPage, savePage, searchPages, deletePage } from '@/api/wiki-api';
export const usePageStore = create((set, get) => ({
    pages: [],
    searchResults: null,
    currentPageId: null,
    currentContent: null,
    loading: false,
    error: null,
    fetchPages: async () => {
        set({ loading: true, error: null });
        try {
            const pages = await listPages();
            set({ pages, loading: false });
        }
        catch (e) {
            set({ error: String(e), loading: false });
        }
    },
    search: async (query) => {
        set({ loading: true, error: null });
        try {
            const results = await searchPages(query);
            set({ searchResults: results, loading: false });
        }
        catch (e) {
            set({ error: String(e), loading: false });
        }
    },
    clearSearch: () => set({ searchResults: null }),
    openPage: async (pageId) => {
        set({ loading: true, error: null });
        try {
            const content = await readPage(pageId);
            set({ currentPageId: pageId, currentContent: content, loading: false });
        }
        catch (e) {
            set({ error: String(e), loading: false });
        }
    },
    saveCurrent: async (content) => {
        const { currentPageId } = get();
        if (!currentPageId)
            return;
        set({ loading: true, error: null });
        try {
            await savePage(currentPageId, content);
            set({ currentContent: content, loading: false });
        }
        catch (e) {
            set({ error: String(e), loading: false });
        }
    },
    closePage: () => set({ currentPageId: null, currentContent: null }),
    deletePage: async (pageId) => {
        set({ loading: true, error: null });
        try {
            await deletePage(pageId);
            const { pages, currentPageId } = get();
            set({
                pages: pages.filter(p => p.path !== pageId),
                loading: false,
                ...(currentPageId === pageId ? { currentPageId: null, currentContent: null } : {}),
            });
        }
        catch (e) {
            set({ error: String(e), loading: false });
        }
    },
}));
