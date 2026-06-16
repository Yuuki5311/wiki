import { useState } from 'react'
import { NavBar } from '@/components/layout/nav-bar'
import { GraphView } from '@/components/graph/graph-view'
import { PageList } from '@/components/pages/page-list'
import { PageDetail } from '@/components/pages/page-detail'
import { IngestDialog } from '@/components/ingest/ingest-dialog'
import { SourceFileList } from '@/components/sources/source-file-list'
import { SourceFileDetail } from '@/components/sources/source-file-detail'
import { usePageStore } from '@/stores/page-store'
import { LoginPage } from '@/components/auth/login-page'
import { useAuthStore } from '@/stores/auth-store'

type View = 'graph' | 'pages' | 'sources'

export default function App() {
  const token = useAuthStore(s => s.token)
  const [view, setView] = useState<View>('graph')
  const [ingestOpen, setIngestOpen] = useState(false)
  const [selectedSourceFile, setSelectedSourceFile] = useState<string | null>(null)
  const { currentPageId, openPage, closePage } = usePageStore()

  if (!token) return <LoginPage />

  const handleNodeClick = (pageId: string) => {
    openPage(pageId)
    setView('pages')
  }

  const handleViewChange = (v: View) => {
    setView(v)
    if (v !== 'sources') setSelectedSourceFile(null)
  }

  return (
    <div className="flex flex-col h-screen">
      <NavBar view={view} onViewChange={handleViewChange} onIngestOpen={() => setIngestOpen(true)} />
      <main className="flex-1 overflow-hidden">
        {view === 'graph' && <GraphView onNodeClick={handleNodeClick} />}
        {view === 'pages' && (
          currentPageId
            ? <PageDetail onBack={closePage} />
            : <PageList onPageSelect={openPage} />
        )}
        {view === 'sources' && (
          selectedSourceFile
            ? <SourceFileDetail fileName={selectedSourceFile} onBack={() => setSelectedSourceFile(null)} />
            : <SourceFileList onFileSelect={setSelectedSourceFile} />
        )}
      </main>
      {ingestOpen && <IngestDialog onClose={() => setIngestOpen(false)} />}
    </div>
  )
}
