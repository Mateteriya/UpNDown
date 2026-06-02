import { useState } from 'react';
import { portalShareUrl } from '../portal/site';

type Props = {
  path?: string;
  compact?: boolean;
};

export function PortalUrlCopy({ path = '/', compact }: Props) {
  const [copied, setCopied] = useState(false);
  const url = portalShareUrl(path);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (compact) {
    return (
      <button type="button" className="portal-url-copy portal-url-copy--compact" onClick={copy} title={url}>
        {copied ? 'Ссылка скопирована' : 'Скопировать ссылку на портал'}
      </button>
    );
  }

  return (
    <div className="portal-url-banner">
      <span className="portal-url-label">Ссылка на портал</span>
      <a href={url} className="portal-url-link">
        {url.replace('https://', '')}
      </a>
      <button type="button" className="btn btn-neon-cyan" onClick={copy}>
        {copied ? 'Скопировано ✓' : 'Копировать'}
      </button>
    </div>
  );
}
