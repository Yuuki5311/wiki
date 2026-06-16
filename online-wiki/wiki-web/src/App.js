import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { NavBar } from '@/components/layout/nav-bar';
import { GraphView } from '@/components/graph/graph-view';
import { PageList } from '@/components/pages/page-list';
import { PageDetail } from '@/components/pages/page-detail';
import { IngestDialog } from '@/components/ingest/ingest-dialog';
import { SourceFileList } from '@/components/sources/source-file-list';
import { SourceFileDetail } from '@/components/sources/source-file-detail';
import { usePageStore } from '@/stores/page-store';
import { LoginPage } from '@/components/auth/login-page';
import { useAuthStore } from '@/stores/auth-store';
export default function App() {
    const token = useAuthStore(s => s.token);
    const [view, setView] = useState('graph');
    const [ingestOpen, setIngestOpen] = useState(false);
    const [selectedSourceFile, setSelectedSourceFile] = useState(null);
    const { currentPageId, openPage, closePage } = usePageStore();
    if (!token)
        return _jsx(LoginPage, {});
    const handleNodeClick = (pageId) => {
        openPage(pageId);
        setView('pages');
    };
    const handleViewChange = (v) => {
        setView(v);
        if (v !== 'sources')
            setSelectedSourceFile(null);
    };
    return (_jsxs("div", { className: "flex flex-col h-screen", children: [_jsx(NavBar, { view: view, onViewChange: handleViewChange, onIngestOpen: () => setIngestOpen(true) }), _jsxs("main", { className: "flex-1 overflow-hidden", children: [view === 'graph' && _jsx(GraphView, { onNodeClick: handleNodeClick }), view === 'pages' && (currentPageId
                        ? _jsx(PageDetail, { onBack: closePage })
                        : _jsx(PageList, { onPageSelect: openPage })), view === 'sources' && (selectedSourceFile
                        ? _jsx(SourceFileDetail, { fileName: selectedSourceFile, onBack: () => setSelectedSourceFile(null) })
                        : _jsx(SourceFileList, { onFileSelect: setSelectedSourceFile }))] }), ingestOpen && _jsx(IngestDialog, { onClose: () => setIngestOpen(false) })] }));
}
