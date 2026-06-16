import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getSourceFile } from '@/api/wiki-api';
export function SourceFileDetail({ fileName, onBack }) {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        setLoading(true);
        setContent(null);
        setError(null);
        getSourceFile(fileName)
            .then(c => setContent(c))
            .catch(e => setError(String(e)))
            .finally(() => setLoading(false));
    }, [fileName]);
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0", children: [_jsx("button", { onClick: onBack, className: "text-gray-400 hover:text-white transition-colors", title: "\u8FD4\u56DE", children: _jsx(ArrowLeft, { size: 16 }) }), _jsx("span", { className: "text-sm text-white font-medium", children: fileName })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4", children: [loading && (_jsxs("div", { className: "flex items-center text-gray-400", children: [_jsx(Loader2, { className: "animate-spin mr-2", size: 16 }), " \u52A0\u8F7D\u4E2D..."] })), error && _jsx("div", { className: "text-red-400 text-sm", children: error }), content !== null && (_jsx("pre", { className: "text-sm text-gray-200 whitespace-pre-wrap font-mono leading-relaxed", children: content }))] })] }));
}
