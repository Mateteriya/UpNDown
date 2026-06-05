import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PortalSyncBanner } from './components/PortalSyncBanner';
import { ProgressTools } from './pages/ProgressTools';
import { DashboardPage } from './pages/DashboardPage';
import { ConceptPage } from './pages/ConceptPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { AppPlanPage } from './pages/AppPlanPage';
import { TeamPage } from './pages/TeamPage';
import { LaterPage } from './pages/LaterPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { DocPage } from './pages/DocPage';
import { WorkPage } from './pages/WorkPage';
import { useTaskWork } from './portal/useTaskWork';

export function App() {
  const work = useTaskWork();

  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Layout
        tools={<ProgressTools work={work} />}
        syncBanner={<PortalSyncBanner syncEnabled={work.syncEnabled} syncError={work.syncError} />}
      >
        <Routes>
          <Route index element={<DashboardPage work={work} />} />
          <Route path="concept" element={<ConceptPage />} />
          <Route path="roadmap" element={<RoadmapPage work={work} />} />
          <Route path="app/*" element={<AppPlanPage work={work} />} />
          <Route path="work" element={<WorkPage work={work} />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="doc/*" element={<DocPage />} />
          <Route path="later" element={<LaterPage work={work} />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
