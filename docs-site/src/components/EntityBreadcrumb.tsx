type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  crumbs: Crumb[];
};

export function EntityBreadcrumb({ crumbs }: Props) {
  if (crumbs.length === 0) return null;
  return (
    <nav className="entity-breadcrumb" aria-label="Контекст задачи">
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="entity-breadcrumb-item">
          {i > 0 && <span className="entity-breadcrumb-sep">→</span>}
          {c.href ? (
            <a href={c.href} className="entity-breadcrumb-link">
              {c.label}
            </a>
          ) : (
            <span className="entity-breadcrumb-current">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
