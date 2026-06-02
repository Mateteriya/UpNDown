import { Link } from 'react-router-dom';
import { ResourceHub } from '../components/ResourceHub';
import { REPO_URL } from '../portal/resources';

export function ResourcesPage() {
  return (
    <div className="page resources-page">
      <header className="page-hero">
        <p className="eyebrow eyebrow--neon">Ресурсы</p>
        <h1>Документы и файлы репозитория</h1>
        <p className="lead">
          Документы <strong>.md</strong> читаются в портале. Ссылки на исходный код — в репозитории GitHub.
        </p>
        <div className="hero-actions">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-neon-cyan">
            GitHub →
          </a>
          <Link to="/" className="btn btn-ghost-neon">
            Дашборд
          </Link>
        </div>
      </header>

      <section className="panel panel--resources">
        <ResourceHub variant="full" />
      </section>
    </div>
  );
}
