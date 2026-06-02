import type { ReactNode } from 'react';

type Props = {
  title: string;
  hint?: string;
  children: ReactNode;
};

export function KpiSection({ title, hint, children }: Props) {
  return (
    <section className="kpi-section">
      <div className="kpi-section-head">
        <h2 className="kpi-section-title">{title}</h2>
        {hint && <p className="kpi-section-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
