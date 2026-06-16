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
export async function listPages() {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/pages`, { headers: authHeaders() });
    handleResponse(res, '获取页面列表失败');
    const data = await res.json();
    return data.pages.map(path => ({
        path,
        title: path.replace(/^wiki\//, '').replace(/\.md$/, ''),
    }));
}
export async function readPage(pageId) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/pages/${encodeURIComponent(pageId)}`, { headers: authHeaders() });
    handleResponse(res, `读取页面失败: ${pageId}`);
    const data = await res.json();
    return data.content;
}
export async function savePage(pageId, content) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/pages/${encodeURIComponent(pageId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ content }),
    });
    handleResponse(res, '保存页面失败');
}
export async function searchPages(query) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
    handleResponse(res, '搜索失败');
    const data = await res.json();
    return data.results;
}
export async function submitIngest(fileName, content) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ sourceFileName: fileName, sourceContent: content }),
    });
    handleResponse(res, '提交失败');
    const data = await res.json();
    return data.jobId;
}
export async function getJobStatus(jobId) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/jobs/${jobId}`, { headers: authHeaders() });
    handleResponse(res, '查询任务状态失败');
    return res.json();
}
export async function deletePage(pageId) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/pages/${encodeURIComponent(pageId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    handleResponse(res, '删除页面失败');
}
export async function listSourceFiles() {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/sources`, { headers: authHeaders() });
    handleResponse(res, '获取原文件列表失败');
    const data = await res.json();
    return data.files;
}
export async function getSourceFile(fileName) {
    const res = await fetch(`${API_BASE}/${WIKI_ID}/sources/${encodeURIComponent(fileName)}`, { headers: authHeaders() });
    handleResponse(res, `读取原文件失败: ${fileName}`);
    const data = await res.json();
    return data.content;
}
