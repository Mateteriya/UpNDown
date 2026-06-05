import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BrandEmblem } from '../components/BrandEmblem';
import { SimpleMarkdown } from '../lib/simpleMarkdown';
import { docAssetUrl, repoFileUrl } from '../portal/resources';

export function DocPage() {
  const params = useParams();
  const path = decodeURIComponent(params['*'] ?? '');
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!path || !path.endsWith('.md')) {
      setError('Не указан путь к документу (.md)');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setBody(null);

    fetch(docAssetUrl(path))
      .then((res) => {
        if (!res.ok) throw new Error(`Документ не найден (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setBody(text);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  const title = path.split('/').pop()?.replace(/\.md$/i, '') ?? 'Документ';

  return (
    <div className="page doc-page">
      <header className="doc-page-header page-hero--branded">
        <Link to="/resources" className="doc-back">
          ← Ресурсы
        </Link>
        <div className="doc-page-header-top">
          <BrandEmblem size="lg" embossed glow />
          <div className="doc-page-header-copy">
            <p className="eyebrow eyebrow--neon">Документ</p>
            <h1>{title.replace(/-/g, ' ')}</h1>
            <code className="doc-path-badge">{path}</code>
          </div>
        </div>
        <div className="doc-page-actions">
          <a
            href={repoFileUrl(path)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost-neon"
          >
            GitHub (если запушено)
          </a>
        </div>
      </header>

      <section className="panel panel--doc">
        {loading && <p className="doc-status">Загрузка…</p>}
        {error && (
          <div className="doc-error">
            <p>{error}</p>
            <p className="doc-error-hint">
              Файл копируется в портал при старте из папки <code>docs/</code> в репозитории. Проверьте, что{' '}
              <code>{path}</code> существует на диске.
            </p>
          </div>
        )}
        {body && <SimpleMarkdown source={body} />}
      </section>
    </div>
  );
}
