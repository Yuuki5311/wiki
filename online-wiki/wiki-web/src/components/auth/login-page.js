import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2, Lock } from 'lucide-react';
export function LoginPage() {
    const [password, setPassword] = useState('');
    const { login, loading, error } = useAuthStore();
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!password.trim())
            return;
        await login(password);
    };
    return (_jsx("div", { className: "min-h-screen bg-gray-950 flex items-center justify-center", children: _jsxs("div", { className: "bg-gray-900 border border-gray-800 rounded-lg p-8 w-full max-w-sm", children: [_jsxs("div", { className: "flex flex-col items-center mb-6", children: [_jsx("div", { className: "w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center mb-3", children: _jsx(Lock, { size: 22, className: "text-blue-400" }) }), _jsx("h1", { className: "text-lg font-semibold text-white", children: "Wiki \u77E5\u8BC6\u5E93" }), _jsx("p", { className: "text-sm text-gray-400 mt-1", children: "\u8BF7\u8F93\u5165\u8BBF\u95EE\u5BC6\u7801" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-3", children: [_jsx("label", { htmlFor: "wiki-password", className: "sr-only", children: "\u8BBF\u95EE\u5BC6\u7801" }), _jsx("input", { id: "wiki-password", type: "password", value: password, onChange: e => setPassword(e.target.value), placeholder: "\u8F93\u5165\u5BC6\u7801", autoFocus: true, className: "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" }), error && (_jsx("p", { className: "text-xs text-red-400", children: error })), _jsxs("button", { type: "submit", disabled: loading || !password.trim(), className: "w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm text-white font-medium flex items-center justify-center gap-2 transition-colors", children: [loading && _jsx(Loader2, { size: 14, className: "animate-spin" }), "\u8FDB\u5165"] })] })] }) }));
}
