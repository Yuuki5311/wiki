import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePageStore } from '@/stores/page-store';
import { ArrowLeft, Pencil, Save, X, Loader2 } from 'lucide-react';
export function PageDetail({ onBack }) {
    const { currentPageId, currentContent, loading, saveCurrent } = usePageStore();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const title = currentPageId?.replace(/^wiki\//, '').replace(/\.md$/, '') ?? '';
    const handleEdit = () => {
        setDraft(currentContent ?? '');
        setEditing(true);
    };
    const handleSave = async () => {
        await saveCurrent(draft);
        setEditing(false);
    };
    const handleCancel = () => {
        setEditing(false);
        setDraft('');
    };
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0", children: [_jsx("button", { onClick: onBack, className: "text-gray-400 hover:text-white transition-colors", children: _jsx(ArrowLeft, { size: 18 }) }), _jsx("h1", { className: "flex-1 text-sm font-medium text-white", children: title }), !editing ? (_jsxs("button", { onClick: handleEdit, className: "flex items-center gap-1 text-sm text-gray-400 hover:text-white", children: [_jsx(Pencil, { size: 14 }), " \u7F16\u8F91"] })) : (_jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: handleSave, disabled: loading, className: "flex items-center gap-1 text-sm text-green-400 hover:text-green-300", children: [loading ? _jsx(Loader2, { size: 14, className: "animate-spin" }) : _jsx(Save, { size: 14 }), " \u4FDD\u5B58"] }), _jsxs("button", { onClick: handleCancel, className: "flex items-center gap-1 text-sm text-gray-400 hover:text-white", children: [_jsx(X, { size: 14 }), " \u53D6\u6D88"] })] }))] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: loading && !currentContent ? (_jsx("div", { className: "flex justify-center text-gray-400", children: _jsx(Loader2, { className: "animate-spin", size: 20 }) })) : editing ? (_jsx("textarea", { value: draft, onChange: e => setDraft(e.target.value), className: "w-full h-full min-h-[60vh] bg-gray-800 border border-gray-700 rounded p-4 text-sm text-white font-mono resize-none focus:outline-none focus:border-blue-500" })) : (_jsx("div", { className: "prose prose-invert prose-sm max-w-none", children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: currentContent ?? '' }) })) })] }));
}
