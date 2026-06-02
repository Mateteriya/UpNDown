import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  caption?: string;
  /** Краткая подсказка под заголовком таблицы */
  hint?: string;
};

/** Обёртка для современных enterprise-таблиц */
export function TableShell({ children, caption, hint }: Props) {
  return (
    <figure className="table-shell">
      {caption && (
        <figcaption className="table-shell-caption">
          <span>{caption}</span>
          {hint && <span className="table-shell-hint">{hint}</span>}
        </figcaption>
      )}
      <div className="table-scroll">{children}</div>
    </figure>
  );
}
