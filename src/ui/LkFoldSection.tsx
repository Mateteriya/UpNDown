import { useId, useState, type ReactNode } from 'react';

type Props = {
  title: string;
  peek?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Сворачиваемая секция панелей ЛК на ПК. По умолчанию закрыта. */
export function LkFoldSection({ title, peek, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={['lk-pc-fold', open ? 'lk-pc-fold--open' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="lk-pc-fold__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lk-pc-fold__copy">
          <span className="lk-pc-fold__title">{title}</span>
          {!open && peek ? <span className="lk-pc-fold__peek">{peek}</span> : null}
        </span>
        <span className="lk-pc-fold__chev" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="lk-pc-fold__body">
          {children}
        </div>
      ) : null}
    </div>
  );
}
