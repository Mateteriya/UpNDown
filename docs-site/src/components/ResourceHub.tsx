import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEV_COMMANDS,
  REPO_URL,
  RESOURCE_CATEGORIES,
  docPortalPath,
  repoFileUrl,
  resourceLinkKind,
  type ResourceLink,
} from '../portal/resources';

type Props = {
  variant?: 'dashboard' | 'full' | 'compact';
};

function ResourceLinkRow({ link }: { link: ResourceLink }) {
  const kind = resourceLinkKind(link);
  const pathLabel = link.path || REPO_URL.replace('https://', '');

  if (kind === 'markdown') {
    return (
      <li className="resource-link-item">
        <Link to={docPortalPath(link.path)} className="resource-link resource-link--portal">
          <span className="resource-link-title">{link.title}</span>
          <span className="resource-link-why">{link.why}</span>
          <code className="resource-link-path">{link.path}</code>
          <span className="resource-link-badge resource-link-badge--portal">Читать в портале</span>
        </Link>
        <a
          href={repoFileUrl(link.path)}
          target="_blank"
          rel="noopener noreferrer"
          className="resource-link-side"
          title="Открыть на GitHub (если файл в main)"
        >
          GitHub ↗
        </a>
      </li>
    );
  }

  const href = link.external && !link.path ? REPO_URL : repoFileUrl(link.path);

  return (
    <li className="resource-link-item">
      <a href={href} target="_blank" rel="noopener noreferrer" className="resource-link">
        <span className="resource-link-title">{link.title}</span>
        <span className="resource-link-why">{link.why}</span>
        <code className="resource-link-path">{pathLabel}</code>
        <span className="resource-link-badge">GitHub ↗</span>
      </a>
    </li>
  );
}

export function ResourceHub({ variant = 'dashboard' }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyCmd(cmd: string, id: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }

  const isCompact = variant === 'compact';

  return (
    <section className={`resource-hub resource-hub--${variant}`}>
      {!isCompact && (
        <div className="panel-head">
          <div>
            <h2>{variant === 'full' ? 'Каталог' : 'Репозиторий и файлы'}</h2>
            <p className="resource-hub-lead">
              Документы <strong>.md</strong> — в портале. Код и папки — в репозитории на GitHub.
            </p>
          </div>
          {variant !== 'full' && (
            <Link to="/resources" className="btn primary btn-neon-gold">
              Все ресурсы →
            </Link>
          )}
          {variant === 'full' && (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary btn-neon-gold"
            >
              GitHub →
            </a>
          )}
        </div>
      )}

      {isCompact && (
        <div className="resource-hub-compact-head">
          <h2>Документы по плану</h2>
          <Link to="/resources" className="btn btn-neon-cyan">
            Каталог ресурсов →
          </Link>
        </div>
      )}

      {!isCompact && (
        <div className="command-strip" aria-label="Команды разработки">
          {DEV_COMMANDS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="command-chip"
              onClick={() => copyCmd(c.cmd, c.id)}
              title={`Скопировать: ${c.cmd}`}
            >
              <span className="command-chip-label">{c.label}</span>
              <code className="command-chip-cmd">{c.cmd}</code>
              <span className="command-chip-note">{copied === c.id ? 'Скопировано ✓' : c.note}</span>
            </button>
          ))}
        </div>
      )}

      <div className={`resource-grid ${isCompact ? 'resource-grid--compact' : ''}`}>
        {(isCompact
          ? RESOURCE_CATEGORIES.filter((c) => c.id === 'strategy' || c.id === 'legal')
          : RESOURCE_CATEGORIES
        ).map((cat) => (
          <article key={cat.id} className={`resource-card accent-${cat.accent}`}>
            <header className="resource-card-head">
              <h3>{cat.title}</h3>
              <p>{cat.hint}</p>
            </header>
            <ul className="resource-link-list">
              {cat.links.map((link) => (
                <ResourceLinkRow key={link.id} link={link} />
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
