/**
 * После партии без сессии: сохранить для синхронизации с аккаунтом (email + outbox).
 */
import { useState } from 'react';
import type { PartyArchiveRecord } from '../game/partyArchive';
import { createClaimReceipt, rememberPendingClaimToken, type PartyClaimIntent } from '../game/partyClaim';
import { submitNewPartyClaim } from '../lib/partyClaimCloud';
import { useT } from '../i18n';

export function PartyClaimOffer({
  archive,
  onDone,
}: {
  archive: PartyArchiveRecord;
  onDone?: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<'ask' | 'email' | 'done' | 'hidden'>('ask');
  const [intent, setIntent] = useState<PartyClaimIntent>('existing_account');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);

  if (step === 'hidden') return null;

  const choose = (next: PartyClaimIntent) => {
    setIntent(next);
    setStep('email');
    setErr(null);
  };

  const submit = async () => {
    const em = email.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErr(t('partyClaim.badEmail'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const receipt = createClaimReceipt({ archive, email: em, intent });
      rememberPendingClaimToken(receipt.claimToken);
      const res = await submitNewPartyClaim(receipt);
      setEmailed(!!res.emailed);
      if (res.error && !res.emailed) setErr(res.error);
      setStep('done');
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="party-claim-offer" style={{ marginTop: 16, textAlign: 'left', maxWidth: 420 }}>
      {step === 'ask' && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: '#cbd5e1', lineHeight: 1.4 }}>
            {t('partyClaim.ask')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="cosmic-glass-btn" onClick={() => choose('existing_account')}>
              {t('partyClaim.yesExisting')}
            </button>
            <button type="button" className="cosmic-glass-btn" onClick={() => choose('new_account')}>
              {t('partyClaim.yesNew')}
            </button>
            <button
              type="button"
              className="cosmic-glass-btn"
              style={{ opacity: 0.85 }}
              onClick={() => {
                setStep('hidden');
                onDone?.();
              }}
            >
              {t('partyClaim.noLocal')}
            </button>
          </div>
        </>
      )}
      {step === 'email' && (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>
            {intent === 'new_account' ? t('partyClaim.emailNewHint') : t('partyClaim.emailExistingHint')}
          </p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(15,23,42,0.7)',
              color: '#f8fafc',
              marginBottom: 8,
            }}
          />
          {err && (
            <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 8px' }} role="alert">
              {err}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="cosmic-glass-btn" disabled={busy} onClick={() => void submit()}>
              {busy ? t('partyClaim.sending') : t('partyClaim.send')}
            </button>
            <button type="button" className="cosmic-glass-btn" disabled={busy} onClick={() => setStep('ask')}>
              {t('common.back')}
            </button>
          </div>
        </>
      )}
      {step === 'done' && (
        <p style={{ margin: 0, fontSize: 13, color: '#86efac', lineHeight: 1.45 }}>
          {emailed ? t('partyClaim.doneEmailed') : t('partyClaim.doneQueued')}
        </p>
      )}
    </div>
  );
}
