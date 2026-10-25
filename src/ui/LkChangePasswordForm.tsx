/**
 * Смена / первичная установка пароля в ЛК.
 * Для email-аккаунтов — текущий + новый; для OAuth-only — только новый (задать пароль).
 */

import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import { CosmicPhysButton } from './CosmicCockpit';

const MIN_PASSWORD_LENGTH = 6;

export function LkChangePasswordForm({ className = '' }: { className?: string }) {
  const t = useT();
  const { changePassword, hasEmailPassword, user } = useAuth();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!user) return null;

  const needCurrent = hasEmailPassword;
  const title = needCurrent ? t('cabinet.passwordChange') : t('cabinet.passwordSet');

  const resetFields = () => {
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
  };

  const onSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setOk(false);
    if (needCurrent && !currentPassword.trim()) {
      setError(t('cabinet.passwordNeedCurrent'));
      return;
    }
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth.passwordMin', { n: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (nextPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (needCurrent && currentPassword === nextPassword) {
      setError(t('cabinet.passwordSame'));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await changePassword(
        nextPassword,
        needCurrent ? currentPassword : undefined,
      );
      if (err) {
        const msg = err.message || '';
        if (/current.?password|Current password/i.test(msg)) {
          setError(t('cabinet.passwordWrongCurrent'));
        } else if (/same password|different from the old/i.test(msg)) {
          setError(t('cabinet.passwordSame'));
        } else if (/reauthentication|recently/i.test(msg)) {
          setError(t('cabinet.passwordReauth'));
        } else {
          setError(msg || t('cabinet.passwordFailed'));
        }
        return;
      }
      setOk(true);
      resetFields();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={['lk-pwd', className].filter(Boolean).join(' ')}>
      {!open ? (
        <div className="lk-pwd__bar">
          <CosmicPhysButton
            variant="secondary"
            type="button"
            onClick={() => {
              setOpen(true);
              setOk(false);
              setError(null);
            }}
          >
            {title}
          </CosmicPhysButton>
          {ok ? (
            <p className="lk-pwd__ok" role="status">
              {t('cabinet.passwordSaved')}
            </p>
          ) : null}
        </div>
      ) : (
        <form className="lk-pwd__form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <p className="lk-pwd__lead">{needCurrent ? t('cabinet.passwordChangeLead') : t('cabinet.passwordSetLead')}</p>
          {needCurrent ? (
            <div className="lk-pwd__field">
              <label className="lk-pwd__label" htmlFor={`${formId}-cur`}>
                {t('cabinet.passwordCurrent')}
              </label>
              <input
                id={`${formId}-cur`}
                className="lk-pwd__input"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={busy}
              />
            </div>
          ) : null}
          <div className="lk-pwd__field">
            <label className="lk-pwd__label" htmlFor={`${formId}-new`}>
              {t('cabinet.passwordNew')}
            </label>
            <input
              id={`${formId}-new`}
              className="lk-pwd__input"
              type="password"
              autoComplete="new-password"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              disabled={busy}
              placeholder={t('auth.passwordPlaceholder', { n: MIN_PASSWORD_LENGTH })}
            />
          </div>
          <div className="lk-pwd__field">
            <label className="lk-pwd__label" htmlFor={`${formId}-confirm`}>
              {t('auth.confirmPassword')}
            </label>
            <input
              id={`${formId}-confirm`}
              className="lk-pwd__input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {error ? (
            <p className="lk-pwd__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="lk-pwd__actions">
            <CosmicPhysButton variant="primary" type="submit" disabled={busy}>
              {busy ? t('cabinet.passwordSaving') : t('cabinet.passwordSave')}
            </CosmicPhysButton>
            <CosmicPhysButton
              variant="secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setError(null);
                resetFields();
              }}
            >
              {t('common.cancel')}
            </CosmicPhysButton>
          </div>
        </form>
      )}
    </div>
  );
}
