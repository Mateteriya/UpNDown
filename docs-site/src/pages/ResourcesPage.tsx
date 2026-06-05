import { Link } from 'react-router-dom';
import { PageHero } from '../components/PageHero';
import { ResourceHub } from '../components/ResourceHub';
import { REPO_URL } from '../portal/resources';

export function ResourcesPage() {
  return (
    <div className="page resources-page">
      <PageHero
        eyebrow="Ресурсы"
        title="Документы и файлы репозитория"
        lead={
          <>
            Документы <strong>.md</strong> читаются в портале. Ссылки на исходный код — в репозитории GitHub.
          </>
        }
        neon
        emblemSize="xl"
      >
        <div className="hero-actions">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-neon-cyan">
            GitHub →
          </a>
          <Link to="/" className="btn btn-ghost-neon">
            Дашборд
          </Link>
        </div>
      </PageHero>

      <section className="panel panel--resources">
        <ResourceHub variant="full" />
      </section>
    </div>
  );
}
