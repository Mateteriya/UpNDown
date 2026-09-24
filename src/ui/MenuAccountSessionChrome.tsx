/**
 * ПК: «ушко» над капсулой кабинета для вошедшего — статус «онлайн».
 * Глиф выхода — справа в вертикальном ободе; модалка подтверждения — здесь.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';

type MenuAccountSessionChromeProps = {
  /** Только вошедший + ПК-меню. */
  enabled: boolean;
  email?: string | null;
  /** После выхода открыть AuthModal (смена аккаунта). */
  onSwitchAccount: () => void;
  children: ReactNode;
};

const MenuAccountSignOutCtx = createContext<(() => void) | null>(null);

export function useMenuAccountSignOutRequest(): (() => void) | null {
  return useContext(MenuAccountSignOutCtx);
}

function OnlineCheckGlyph() {
  return (
    <svg className="menu-account-ear__check" viewBox="0 0 16 16" focusable="false" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
      <path
        d="M4.2 8.2 6.7 10.6 11.8 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuAccountSessionChrome({
  enabled,
  email,
  onSwitchAccount,
  children,
}: MenuAccountSessionChromeProps) {
  const t = useT();
  const { signOut } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  const openConfirm = useCallback(() => setConfirmOpen(true), []);

  const closeConfirm = useCallback(() => {
    if (busy) return;
    setConfirmOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOpen, closeConfirm]);

  const handleSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOut();
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }, [signOut]);

  const handleSwitch = useCallback(async () => {
    setBusy(true);
    try {
      await signOut();
      setConfirmOpen(false);
      onSwitchAccount();
    } finally {
      setBusy(false);
    }
  }, [signOut, onSwitchAccount]);

  if (!enabled) return <>{children}</>;

  const modal =
    confirmOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="lk-modal menu-account-signout-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeConfirm();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div
              className="lk-modal__panel menu-account-signout-modal__panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="lk-modal__head menu-account-signout-modal__head">
                <h2 id={titleId} className="lk-modal__title menu-account-signout-modal__title">
                  {t('menu.accountSessionTitle')}
                </h2>
                <button
                  type="button"
                  className="lk-modal__close"
                  onClick={closeConfirm}
                  aria-label={t('common.close')}
                  disabled={busy}
                >
                  ×
                </button>
              </div>
              <p className="menu-account-signout-modal__body">{t('menu.accountSessionBody')}</p>
              {email ? (
                <p className="menu-account-signout-modal__email" title={email}>
                  {email}
                </p>
              ) : null}
              <div className="menu-account-signout-modal__actions">
                <button
                  type="button"
                  className="menu-account-signout-modal__btn menu-account-signout-modal__btn--ghost"
                  onClick={closeConfirm}
                  disabled={busy}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="menu-account-signout-modal__btn menu-account-signout-modal__btn--switch"
                  onClick={() => void handleSwitch()}
                  disabled={busy}
                >
                  {t('menu.accountSwitch')}
                </button>
                <button
                  type="button"
                  className="menu-account-signout-modal__btn menu-account-signout-modal__btn--out"
                  onClick={() => void handleSignOut()}
                  disabled={busy}
                >
                  {busy ? '…' : t('menu.accountSignOut')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <MenuAccountSignOutCtx.Provider value={openConfirm}>
      <div className="menu-account-wrap">
        <div className="menu-account-ear" role="status">
          <span className="menu-account-ear__online">
            <OnlineCheckGlyph />
            <span className="menu-account-ear__online-text">{t('menu.accountOnline')}</span>
          </span>
        </div>
        {children}
        {modal}
      </div>
    </MenuAccountSignOutCtx.Provider>
  );
}
