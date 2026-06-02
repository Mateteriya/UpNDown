import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProgressTools } from './pages/ProgressTools';
import { DashboardPage } from './pages/DashboardPage';
import { ConceptPage } from './pages/ConceptPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { AppPlanPage } from './pages/AppPlanPage';
import { TeamPage } from './pages/TeamPage';
import { LaterPage } from './pages/LaterPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { DocPage } from './pages/DocPage';
import { useProgress } from './portal/useProgress';

export function App() {
  const { checked, toggle, reset, setAll } = useProgress();

  return (
    <HashRouter>
      <Layout
        tools={
          <ProgressTools checked={checked} onReset={reset} onImport={setAll} />
        }
      >
        <Routes>
          <Route index element={<DashboardPage checked={checked} />} />
          <Route path="concept" element={<ConceptPage />} />
          <Route path="roadmap" element={<RoadmapPage checked={checked} onToggle={toggle} />} />
          <Route path="app/*" element={<AppPlanPage checked={checked} onToggle={toggle} />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="doc/*" element={<DocPage />} />
          <Route path="later" element={<LaterPage checked={checked} onToggle={toggle} />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
