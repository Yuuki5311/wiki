import { API_BASE, WIKI_ID } from '@/config';
import { getToken, useAuthStore } from '@/stores/auth-store';
function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
function handleResponse(res, errorMsg) {
    if (res.status === 401) {
        useAuthStore.getState().logout();
        throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok)
        throw new Error(errorMsg);
    return res;
}
export async function fetchGraph() {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/graph`, { headers: authHeaders() });
    handleResponse(res, '获取图谱失败');
    return res.json();
}
export async function saveGraph(graph) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/graph`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ nodes: graph.nodes, edges: graph.edges }),
    });
    handleResponse(res, '保存图谱失败');
}
