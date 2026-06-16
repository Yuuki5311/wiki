import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Loader2, FileInput } from 'lucide-react';
import { listSourceFiles } from '@/api/wiki-api';
export function SourceFileList({ onFileSelect }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        setLoading(true);
        listSourceFiles()
            .then(f => setFiles(f))
            .catch(e => setError(String(e)))
            .finally(() => setLoading(false));
    }, []);
    if (loading) {
        return (_jsxs("div", { className: "flex items-center justify-center p-8 text-gray-400", children: [_jsx(Loader2, { className: "animate-spin mr-2", size: 16 }), " \u52A0\u8F7D\u4E2D..."] }));
    }
    if (error) {
        return _jsx("div", { className: "p-8 text-red-400 text-sm", children: error });
    }
    if (files.length === 0) {
        return _jsx("div", { className: "text-center p-8 text-gray-500", children: "\u6682\u65E0\u539F\u6587\u4EF6" });
    }
    return (_jsx("div", { className: "flex flex-col h-full overflow-y-auto", children: files.map(fileName => (_jsxs("button", { onClick: () => onFileSelect(fileName), className: "flex items-center gap-2 px-4 py-3 border-b border-gray-800 hover:bg-gray-800 text-left transition-colors", children: [_jsx(FileInput, { size: 14, className: "text-gray-500 shrink-0" }), _jsx("span", { className: "text-sm text-white", children: fileName })] }, fileName))) }));
}
