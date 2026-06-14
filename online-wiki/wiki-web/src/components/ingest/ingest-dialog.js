import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { useIngestStore } from '@/stores/ingest-store';
import { X, Loader2, CheckCircle, AlertCircle, Upload } from 'lucide-react';
export function IngestDialog({ onClose }) {
    const [fileName, setFileName] = useState('');
    const [content, setContent] = useState('');
    const fileInputRef = useRef(null);
    const { submitting, status, error, submit, reset } = useIngestStore();
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = ev => setContent(ev.target?.result ?? '');
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!fileName.trim() || !content.trim())
            return;
        await submit(fileName.trim(), content.trim());
    };
    const handleClose = () => {
        reset();
        onClose();
    };
    const isDone = status?.status === 'done';
    const isError = status?.status === 'error';
    const disabled = submitting || !!status;
    return (_jsx("div", { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-50", children: _jsxs("div", { className: "bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg mx-4", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-gray-800", children: [_jsx("h2", { className: "text-sm font-medium text-white", children: "\u5BFC\u5165\u6587\u6863" }), _jsx("button", { onClick: handleClose, className: "text-gray-400 hover:text-white", children: _jsx(X, { size: 16 }) })] }), _jsxs("form", { onSubmit: handleSubmit, className: "p-4 flex flex-col gap-3", children: [_jsx("input", { ref: fileInputRef, type: "file", accept: ".md,.txt,.markdown", className: "hidden", onChange: handleFileChange, disabled: disabled }), _jsxs("button", { type: "button", onClick: () => fileInputRef.current?.click(), disabled: disabled, className: "w-full py-2 border border-dashed border-gray-600 rounded text-sm text-gray-400 hover:border-blue-500 hover:text-blue-400 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed", children: [_jsx(Upload, { size: 14 }), "\u9009\u62E9\u6587\u4EF6\uFF08.md / .txt\uFF09"] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-400 mb-1", children: "\u6587\u4EF6\u540D" }), _jsx("input", { value: fileName, onChange: e => setFileName(e.target.value), placeholder: "document.md", disabled: disabled, className: "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs text-gray-400 mb-1", children: "\u6587\u6863\u5185\u5BB9" }), _jsx("textarea", { value: content, onChange: e => setContent(e.target.value), placeholder: "\u7C98\u8D34\u6587\u6863\u5185\u5BB9\uFF0C\u6216\u9009\u62E9\u4E0A\u65B9\u6587\u4EF6\u81EA\u52A8\u586B\u5145...", rows: 8, disabled: disabled, className: "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50" })] }), error && (_jsxs("p", { className: "text-xs text-red-400 flex items-center gap-1", children: [_jsx(AlertCircle, { size: 12 }), " ", error] })), status && (_jsxs("div", { className: "text-xs text-gray-300 bg-gray-800 rounded p-3", children: [status.status === 'queued' && _jsx("span", { className: "text-yellow-400", children: "\u6392\u961F\u4E2D..." }), status.status === 'processing' && (_jsxs("span", { className: "text-blue-400 flex items-center gap-1", children: [_jsx(Loader2, { size: 12, className: "animate-spin" }), status.step] })), isDone && status.status === 'done' && (_jsxs("div", { className: "text-green-400", children: [_jsxs("div", { className: "flex items-center gap-1 mb-1", children: [_jsx(CheckCircle, { size: 12 }), " \u5904\u7406\u5B8C\u6210"] }), _jsx("ul", { className: "ml-4 text-gray-400", children: status.pagesWritten.map(p => _jsx("li", { children: p }, p)) })] })), isError && status.status === 'error' && (_jsxs("span", { className: "text-red-400 flex items-center gap-1", children: [_jsx(AlertCircle, { size: 12 }), " ", status.error] }))] })), _jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [_jsx("button", { type: "button", onClick: handleClose, className: "px-3 py-1.5 text-sm text-gray-400 hover:text-white", children: isDone ? '关闭' : '取消' }), !status && (_jsxs("button", { type: "submit", disabled: submitting || !fileName.trim() || !content.trim(), className: "px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white flex items-center gap-1", children: [submitting && _jsx(Loader2, { size: 12, className: "animate-spin" }), "\u63D0\u4EA4"] }))] })] })] }) }));
}
