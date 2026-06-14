import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { usePageStore } from '@/stores/page-store';
import { Search, Loader2, FileText, Trash2 } from 'lucide-react';
export function PageList({ onPageSelect }) {
    const { pages, searchResults, loading, fetchPages, search, clearSearch, deletePage } = usePageStore();
    const [query, setQuery] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    useEffect(() => {
        fetchPages();
    }, [fetchPages]);
    const handleSearch = (e) => {
        e.preventDefault();
        if (query.trim()) {
            search(query.trim());
        }
        else {
            clearSearch();
        }
    };
    const handleDelete = async (e, pageId) => {
        e.stopPropagation();
        if (!confirm(`确认删除页面？\n${pageId}`))
            return;
        setDeletingId(pageId);
        await deletePage(pageId);
        setDeletingId(null);
    };
    const displayItems = searchResults ?? pages.map(p => ({ path: p.path, title: p.title, excerpt: '', score: 0 }));
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsx("div", { className: "p-4 border-b border-gray-800", children: _jsxs("form", { onSubmit: handleSearch, className: "flex gap-2", children: [_jsx("input", { value: query, onChange: e => {
                                setQuery(e.target.value);
                                if (!e.target.value)
                                    clearSearch();
                            }, placeholder: "\u641C\u7D22\u77E5\u8BC6\u5E93...", className: "flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" }), _jsx("button", { type: "submit", className: "px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white", children: _jsx(Search, { size: 15 }) })] }) }), _jsxs("div", { className: "flex-1 overflow-y-auto", children: [loading && (_jsxs("div", { className: "flex items-center justify-center p-8 text-gray-400", children: [_jsx(Loader2, { className: "animate-spin mr-2", size: 16 }), " \u52A0\u8F7D\u4E2D..."] })), !loading && displayItems.length === 0 && (_jsx("div", { className: "text-center p-8 text-gray-500", children: "\u6682\u65E0\u9875\u9762" })), displayItems.map(item => (_jsxs("div", { className: "group flex items-center border-b border-gray-800 hover:bg-gray-800 transition-colors", children: [_jsxs("button", { onClick: () => onPageSelect(item.path), className: "flex-1 text-left px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(FileText, { size: 14, className: "text-gray-500 shrink-0" }), _jsx("span", { className: "text-sm text-white", children: item.title })] }), item.excerpt && (_jsx("p", { className: "text-xs text-gray-500 mt-1 pl-5 line-clamp-2", children: item.excerpt }))] }), _jsx("button", { onClick: e => handleDelete(e, item.path), disabled: deletingId === item.path, className: "opacity-0 group-hover:opacity-100 px-3 py-3 text-gray-500 hover:text-red-400 transition-all disabled:opacity-50", title: "\u5220\u9664\u9875\u9762", children: deletingId === item.path
                                    ? _jsx(Loader2, { size: 14, className: "animate-spin" })
                                    : _jsx(Trash2, { size: 14 }) })] }, item.path)))] })] }));
}
