/**
 * Цветной знак «в аккаунте · who» / «не в аккаунте».
 * sheet — в модалке; header — шапка стола (не на аватарке).
 */

import { useT } from '../i18n';

export type PlayerAccountStatusMarkProps = {
  signedIn: boolean;
  /** Короткое имя аккаунта (email local-part и т.п.). */
  who?: string | null;
  size?: 'sheet' | 'header';
  className?: string;
  onSignIn?: () => void;
  /** Клик по всей плашке (шапка: войти или открыть меню аватара). */
  onActivate?: () => void;
};

export function PlayerAccountStatusMark({
  signedIn,
  who,
  size = 'sheet',
  className,
  onSignIn,
  onActivate,
}: PlayerAccountStatusMarkProps) {
  const t = useT();
  const title = signedIn
    ? t('playerDossier.acctIn', { who: who?.trim() || t('playerDossier.acctAnon') })
    : t('playerDossier.acctOut');

  const interactive = !!onActivate;
  const classNameJoined = [
    'player-acct-mark',
    signedIn ? 'player-acct-mark--in' : 'player-acct-mark--out',
    size === 'header' ? 'player-acct-mark--header' : 'player-acct-mark--sheet',
    interactive ? 'player-acct-mark--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className="player-acct-mark__dot" aria-hidden />
      <span className="player-acct-mark__title">{title}</span>
      {!signedIn && onSignIn && size === 'sheet' ? (
        <button
          type="button"
          className="player-acct-mark__cta"
          onClick={(e) => {
            e.stopPropagation();
            onSignIn();
          }}
        >
          {t('playerDossier.signIn')}
        </button>
      ) : null}
      {!signedIn && size === 'header' ? (
        <span className="player-acct-mark__cta player-acct-mark__cta--static">{t('playerDossier.signIn')}</span>
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <button type="button" className={classNameJoined} onClick={onActivate}>
        {body}
      </button>
    );
  }

  return (
    <div className={classNameJoined} role="status">
      {body}
    </div>
  );
}
