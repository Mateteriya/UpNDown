import type { ReactNode } from 'react';

type Tone = 'ok' | 'warn' | 'todo' | 'info';

const LABELS: Record<Tone, string> = {
  ok: 'Готово',
  warn: 'В работе',
  todo: 'Не начато',
  info: 'Инфо',
};

type Props = {
  tone: Tone;
  children?: ReactNode;
};

export function StatusBadge({ tone, children }: Props) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span className="status-badge-dot" aria-hidden />
      {children ?? LABELS[tone]}
    </span>
  );
}
