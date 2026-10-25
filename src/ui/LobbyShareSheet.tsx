/**
 * Bottom-sheet шаринга кода комнаты.
 * App-scheme без увода SPA. Clipboard — только по явной кнопке (иначе Android
 * показывает серый system «Скопировано»). VK/WeChat/Discord — карточка + вставка.
 */
import { useEffect, useState } from 'react';
import { useT } from '../i18n';

export interface LobbyShareSheetProps {
  open: boolean;
  roomCode: string;
  shareUrl?: string | null;
  onClose: () => void;
  onCopied?: () => void;
  onCopyFail?: () => void;
}

type ShareFeedback = {
  appId: string;
  title: string;
  body: string;
  code: string;
  openLabel?: string;
  openHref?: string | null;
  /** Web-fallback, если scheme не перехватило приложение */
  openWebHref?: string | null;
  /** Показать кнопку «Скопировать код» (clipboard только по нажатию) */
  copyOnOpen?: boolean;
  /** После успешного копирования — короткий статус на карточке */
  copiedFlash?: boolean;
  /** Scheme не сработал и web нет — подсказка на карточке */
  openMiss?: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function isMobileUa() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

function isAndroidUa() {
  return /Android/i.test(navigator.userAgent || '');
}

function openWebTab(href: string) {
  if (!href) return;
  const w = window.open(href, '_blank', 'noopener,noreferrer');
  if (!w) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/** Запуск scheme без смены location SPA. */
function fireScheme(appUrl: string) {
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;top:0';
    iframe.src = appUrl;
    document.body.appendChild(iframe);
    window.setTimeout(() => iframe.remove(), 1800);
  } catch {
    /* ignore */
  }
  const a = document.createElement('a');
  a.href = appUrl;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * App-scheme first. Web — только новая вкладка, и только если приложение не перехватило.
 * onMiss — если scheme молчит и webUrl нет (приложение не установлено).
 */
function openAppOrWeb(
  appUrl: string | null,
  webUrl: string | null,
  onMiss?: () => void,
) {
  let appTookOver = false;
  const markHidden = () => {
    if (document.visibilityState === 'hidden') appTookOver = true;
  };
  document.addEventListener('visibilitychange', markHidden);
  window.addEventListener('pagehide', markHidden);

  if (appUrl) fireScheme(appUrl);

  const delay = appUrl && isMobileUa() ? 1200 : appUrl ? 400 : 0;
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', markHidden);
    window.removeEventListener('pagehide', markHidden);
    if (appTookOver || document.visibilityState === 'hidden') return;
    if (webUrl) {
      openWebTab(webUrl);
      return;
    }
    onMiss?.();
  }, delay);
}

type ShareItem = {
  id: string;
  name: string;
  ico: string;
  run: () => void | Promise<void>;
};

export function LobbyShareSheet({
  open,
  roomCode,
  shareUrl = null,
  onClose,
  onCopied,
  onCopyFail,
}: LobbyShareSheetProps) {
  const t = useT();
  const [feedback, setFeedback] = useState<ShareFeedback | null>(null);
  const code = roomCode.trim().toUpperCase();
  const title = t('lobby.shareTitle');
  const url = (shareUrl || '').trim();
  const shortText = url ? `Up&Down ${code}\n${url}` : `Up&Down ${code}`;
  const mailBody = url ? `${title}\n\n${code}\n${url}` : `${title}\n\n${code}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFeedback(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback]);

  if (!open && !feedback) return null;
  if (!code && !feedback) return null;

  const readyBody = (appId: string): string => {
    switch (appId) {
      case 'vk':
        return t('lobby.shareReadyVk');
      case 'viber':
        return t('lobby.shareReadyViber');
      case 'wechat':
        return t('lobby.shareReadyWeChat');
      case 'discord':
        return t('lobby.shareReadyDiscord');
      case 'gmail':
        return t('lobby.shareReadyGmail');
      case 'qq':
        return t('lobby.shareReadyQq');
      case 'copy':
        return t('lobby.shareReadyCopy');
      default:
        return t('lobby.shareReadyCopy');
    }
  };

  const vkOpenHref = isAndroidUa()
    ? 'intent://vk.com/im#Intent;scheme=https;package=com.vkontakte.android;end'
    : 'vk://vk.com/im';

  const showReady = (
    appId: string,
    openHref?: string | null,
    opts?: { copyOnOpen?: boolean; openWeb?: string | null },
  ) => {
    setFeedback({
      appId,
      title: t('lobby.shareReadyTitle'),
      body: readyBody(appId),
      code,
      openLabel: openHref ? t('lobby.shareReadyOpen') : undefined,
      openHref: openHref ?? null,
      openWebHref: opts?.openWeb ?? null,
      copyOnOpen: opts?.copyOnOpen === true,
      copiedFlash: false,
      openMiss: false,
    });
  };

  const markOpenMiss = () => {
    setFeedback((prev) =>
      prev
        ? {
            ...prev,
            openMiss: true,
            body: t('lobby.shareReadyAppMissing'),
          }
        : prev,
    );
  };

  const openFromCard = () => {
    if (!feedback?.openHref && !feedback?.openWebHref) {
      markOpenMiss();
      return;
    }
    openAppOrWeb(feedback.openHref ?? null, feedback.openWebHref ?? null, markOpenMiss);
  };

  /** Системный share-sheet ОС (без нашего clipboard → без серого «Скопировано»). */
  const tryNativeShare = async (): Promise<boolean> => {
    if (typeof navigator.share !== 'function') return false;
    try {
      const data: ShareData = { title, text: shortText };
      if (url && /^https?:\/\//i.test(url)) data.url = url;
      await navigator.share(data);
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return true; // отмена — не fallback
      return false;
    }
  };

  const markCopiedOnCard = () => {
    setFeedback((prev) => (prev ? { ...prev, copiedFlash: true, title: t('lobby.shareReadyCopiedTitle') } : prev));
    onCopied?.();
  };

  const doCopy = () => {
    // Не копируем сразу (иначе Android показывает серый system toast).
    onClose();
    showReady('copy', null, { copyOnOpen: true });
  };

  const nativeShare = async () => {
    const shared = await tryNativeShare();
    if (shared) {
      onClose();
      return;
    }
    doCopy();
  };

  const shareWhatsApp = () => {
    const q = encodeURIComponent(shortText);
    // Текст в URL — clipboard не трогаем
    openAppOrWeb(`whatsapp://send?text=${q}`, `https://wa.me/?text=${q}`);
    onClose();
  };

  const shareTelegram = () => {
    const label = encodeURIComponent(`Up&Down ${code}`);
    if (url) {
      openAppOrWeb(
        `tg://msg_url?url=${encodeURIComponent(url)}&text=${label}`,
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${label}`,
      );
    } else {
      openAppOrWeb(
        `tg://msg?text=${encodeURIComponent(shortText)}`,
        `https://t.me/share/url?url=${encodeURIComponent('https://t.me')}&text=${encodeURIComponent(shortText)}`,
      );
    }
    onClose();
  };

  /** Viber: текст в scheme; если приложения нет — карточка (web-чата с текстом у Viber нет). */
  const shareViber = () => {
    const q = encodeURIComponent(shortText);
    const href = `viber://forward?text=${q}`;
    fireScheme(href);
    window.setTimeout(() => fireScheme(`viber://share?text=${q}`), 180);
    onClose();
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        showReady('viber', href, { copyOnOpen: true, openWeb: null });
      }
    }, 1100);
  };

  const shareSms = () => {
    const body = encodeURIComponent(shortText);
    const ua = navigator.userAgent || '';
    openAppOrWeb(/iPhone|iPad|iPod/i.test(ua) ? `sms:&body=${body}` : `sms:?body=${body}`, null);
    onClose();
  };

  const shareLine = () => {
    const q = encodeURIComponent(shortText);
    openAppOrWeb(`line://msg/text/?${q}`, `https://line.me/R/msg/text/?${q}`);
    onClose();
  };

  /**
   * VK: нет deep-link с текстом. Не открываем и не копируем сразу —
   * только фирменная карточка: Скопировать → Открыть → Вставить в чат.
   */
  const shareVk = () => {
    onClose();
    showReady('vk', vkOpenHref, { copyOnOpen: true });
  };

  const shareQq = () => {
    if (url && /^https?:\/\//i.test(url)) {
      openAppOrWeb(
        `mqqapi://share/to_fri?file_type=news&src_type=web&version=1&generalpastboard=1&url=${encodeURIComponent(url)}&title=${encodeURIComponent(`Up&Down ${code}`)}&description=${encodeURIComponent(shortText)}`,
        `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(`Up&Down ${code}`)}&summary=${encodeURIComponent(shortText)}`,
      );
      onClose();
      return;
    }
    onClose();
    showReady('qq', null, { copyOnOpen: true });
  };

  /** WeChat / Discord: карточка + open scheme; Discord — web fallback для вставки. */
  const shareWeChat = () => {
    onClose();
    showReady('wechat', 'weixin://', {
      copyOnOpen: true,
      // Web WeChat на телефоне слабый; без app — подсказка «приложения нет»
      openWeb: null,
    });
  };

  const shareDiscord = () => {
    onClose();
    showReady('discord', 'discord://', {
      copyOnOpen: true,
      openWeb: 'https://discord.com/app',
    });
  };

  /**
   * Gmail: сразу compose в Gmail (iOS googlegmail / Android mailto обычно в Gmail).
   */
  const shareGmail = () => {
    const sub = encodeURIComponent(`Up&Down ${code}`);
    const body = encodeURIComponent(mailBody);
    const mailto = `mailto:?subject=${sub}&body=${body}`;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      fireScheme(`googlegmail://co?subject=${sub}&body=${body}`);
      window.setTimeout(() => {
        if (document.visibilityState === 'visible') fireScheme(mailto);
      }, 900);
    } else {
      fireScheme(mailto);
    }
    onClose();
  };

  /**
   * Почта: выбор клиента (не сразу default Gmail).
   * Android SEND message/rfc822 → chooser; иначе mailto.
   */
  const shareMail = () => {
    const sub = encodeURIComponent(`Up&Down ${code}`);
    const body = encodeURIComponent(mailBody);
    const mailto = `mailto:?subject=${sub}&body=${body}`;
    if (isAndroidUa()) {
      fireScheme(
        `intent:#Intent;action=android.intent.action.SEND;type=message/rfc822;S.android.intent.extra.SUBJECT=${sub};S.android.intent.extra.TEXT=${body};end`,
      );
      window.setTimeout(() => {
        if (document.visibilityState === 'visible') {
          fireScheme(
            `intent:#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.SUBJECT=${sub};S.android.intent.extra.TEXT=${body};end`,
          );
        }
      }, 700);
      window.setTimeout(() => {
        if (document.visibilityState === 'visible') fireScheme(mailto);
      }, 1400);
    } else {
      fireScheme(mailto);
    }
    onClose();
  };

  const sections: { title: string; items: ShareItem[] }[] = [
    {
      title: t('lobby.shareGroupQuick'),
      items: [
        ...(typeof navigator !== 'undefined' && typeof navigator.share === 'function'
          ? [{ id: 'native', name: t('lobby.shareNative'), ico: 'lobby-share-ico--os', run: nativeShare }]
          : []),
        { id: 'copy', name: t('lobby.copyCode'), ico: 'lobby-share-ico--copy', run: doCopy },
      ],
    },
    {
      title: t('lobby.shareGroupChat'),
      items: [
        { id: 'wa', name: 'WhatsApp', ico: 'lobby-share-ico--wa', run: shareWhatsApp },
        { id: 'tg', name: 'Telegram', ico: 'lobby-share-ico--tg', run: shareTelegram },
        { id: 'vb', name: 'Viber', ico: 'lobby-share-ico--vb', run: () => void shareViber() },
        { id: 'line', name: 'LINE', ico: 'lobby-share-ico--line', run: shareLine },
        { id: 'sms', name: t('lobby.shareSms'), ico: 'lobby-share-ico--sms', run: shareSms },
        { id: 'wechat', name: 'WeChat', ico: 'lobby-share-ico--wechat', run: shareWeChat },
        { id: 'qq', name: 'QQ', ico: 'lobby-share-ico--qq', run: shareQq },
        { id: 'dc', name: 'Discord', ico: 'lobby-share-ico--dc', run: shareDiscord },
      ],
    },
    {
      title: t('lobby.shareGroupMore'),
      items: [
        { id: 'vk', name: 'VK', ico: 'lobby-share-ico--vk', run: shareVk },
        { id: 'gmail', name: 'Gmail', ico: 'lobby-share-ico--gmail', run: shareGmail },
        { id: 'mail', name: t('lobby.shareMail'), ico: 'lobby-share-ico--mail', run: shareMail },
      ],
    },
  ];

  return (
    <>
      {open && code ? (
        <div className="lobby-share" role="presentation">
          <button type="button" className="lobby-share__backdrop" aria-label={t('common.cancel')} onClick={onClose} />
          <aside className="lobby-share__sheet" role="dialog" aria-modal="true" aria-labelledby="lobby-share-title">
            <div className="lobby-share__head">
              <div className="lobby-share__handle" aria-hidden />
              <p id="lobby-share-title" className="lobby-share__title">
                {t('lobby.shareSheetTitle')}
              </p>
              <p className="lobby-share__code">{code}</p>
              {url ? <p className="lobby-share__url">{url.replace(/^https?:\/\//i, '')}</p> : null}
              <p className="lobby-share__hint">{t('lobby.shareSheetHint')}</p>
            </div>
            <div className="lobby-share__body">
              {sections.map((section) =>
                section.items.length === 0 ? null : (
                  <div key={section.title} className="lobby-share__group">
                    <p className="lobby-share__group-title">{section.title}</p>
                    <div className="lobby-share__grid">
                      {section.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="lobby-share__orb"
                          onClick={() => void item.run()}
                        >
                          <span className={`lobby-share__ico lobby-share__ico--3d ${item.ico}`} aria-hidden>
                            <ShareGlyph id={item.id} />
                          </span>
                          <span className="lobby-share__name">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
            <div className="lobby-share__foot">
              <button type="button" className="lobby-share__close" onClick={onClose}>
                {t('common.cancel')}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {feedback ? (
        <div className="lobby-share-ready" role="dialog" aria-modal="true" aria-labelledby="lobby-share-ready-title">
          <button
            type="button"
            className="lobby-share-ready__backdrop"
            aria-label={t('common.cancel')}
            onClick={() => setFeedback(null)}
          />
          <div
            className={[
              'lobby-share-ready__card',
              feedback.copiedFlash ? 'lobby-share-ready__card--armed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="lobby-share-ready__stars" aria-hidden />
            <div className="lobby-share-ready__scan" aria-hidden />
            <div className="lobby-share-ready__corners" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="lobby-share-ready__topline">
              <span className="lobby-share-ready__eyebrow">{t('lobby.shareReadyProtocol')}</span>
              <span
                className={[
                  'lobby-share-ready__status',
                  feedback.copiedFlash ? 'lobby-share-ready__status--ok' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {feedback.copiedFlash ? t('lobby.shareReadyStatusOk') : t('lobby.shareReadyStatusWait')}
              </span>
            </div>

            <div
              className={[
                'lobby-share-ready__badge',
                'lobby-share__ico--3d',
                feedback.appId === 'vk'
                  ? 'lobby-share-ico--vk'
                  : feedback.appId === 'viber'
                    ? 'lobby-share-ico--vb'
                    : feedback.appId === 'wechat'
                      ? 'lobby-share-ico--wechat'
                      : feedback.appId === 'discord'
                        ? 'lobby-share-ico--dc'
                        : feedback.appId === 'gmail'
                          ? 'lobby-share-ico--gmail'
                          : feedback.appId === 'qq'
                            ? 'lobby-share-ico--qq'
                            : 'lobby-share-ico--copy',
              ].join(' ')}
            >
              <ShareGlyph
                id={
                  feedback.appId === 'viber'
                    ? 'vb'
                    : feedback.appId === 'discord'
                      ? 'dc'
                      : feedback.appId === 'copy'
                        ? 'copy'
                        : feedback.appId
                }
              />
            </div>

            <p id="lobby-share-ready-title" className="lobby-share-ready__title">
              {feedback.title}
            </p>

            <div className="lobby-share-ready__code-wrap">
              <span className="lobby-share-ready__code-label">{t('lobby.shareReadyCodeLabel')}</span>
              <p className="lobby-share-ready__code">{feedback.code}</p>
            </div>

            <ol className="lobby-share-ready__steps" aria-label={t('lobby.shareReadyStepsAria')}>
              <li
                className={[
                  'lobby-share-ready__step',
                  feedback.copiedFlash ? 'lobby-share-ready__step--done' : 'lobby-share-ready__step--active',
                ].join(' ')}
              >
                <span className="lobby-share-ready__step-idx">01</span>
                <span className="lobby-share-ready__step-txt">{t('lobby.shareReadyStepCopy')}</span>
              </li>
              <li
                className={[
                  'lobby-share-ready__step',
                  feedback.copiedFlash ? 'lobby-share-ready__step--active' : '',
                  !feedback.openHref ? 'lobby-share-ready__step--muted' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="lobby-share-ready__step-idx">02</span>
                <span className="lobby-share-ready__step-txt">{t('lobby.shareReadyStepOpen')}</span>
              </li>
              <li className="lobby-share-ready__step">
                <span className="lobby-share-ready__step-idx">03</span>
                <span className="lobby-share-ready__step-txt">{t('lobby.shareReadyStepPaste')}</span>
              </li>
            </ol>

            <p className="lobby-share-ready__body">
              {feedback.openMiss
                ? t('lobby.shareReadyAppMissing')
                : feedback.copiedFlash
                  ? t('lobby.shareReadyCopiedBody')
                  : feedback.body}
            </p>

            <div className="lobby-share-ready__actions">
              {feedback.copyOnOpen ? (
                <button
                  type="button"
                  className={[
                    'lobby-share-ready__cta',
                    feedback.copiedFlash ? 'lobby-share-ready__cta--done' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    void (async () => {
                      const ok = await copyText(shortText);
                      if (ok) markCopiedOnCard();
                      else onCopyFail?.();
                    })();
                  }}
                >
                  <span className="lobby-share-ready__cta-kicker">01</span>
                  {feedback.copiedFlash ? t('lobby.shareReadyCopiedBtn') : t('lobby.shareReadyCopyOnly')}
                </button>
              ) : null}
              {feedback.openHref || feedback.openWebHref ? (
                <button
                  type="button"
                  className={[
                    'lobby-share-ready__cta',
                    'lobby-share-ready__cta--secondary',
                    feedback.copiedFlash ? 'lobby-share-ready__cta--pulse' : '',
                    feedback.openMiss ? 'lobby-share-ready__cta--miss' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={openFromCard}
                >
                  <span className="lobby-share-ready__cta-kicker">02</span>
                  {feedback.openMiss
                    ? t('lobby.shareReadyOpenRetry')
                    : feedback.openLabel || t('lobby.shareReadyOpen')}
                </button>
              ) : null}
              <button type="button" className="lobby-share-ready__done" onClick={() => setFeedback(null)}>
                {t('lobby.shareReadyDone')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ShareGlyph({ id }: { id: string }) {
  switch (id) {
    case 'native':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="18" cy="5" r="2.6" fill="#ecfeff" />
          <circle cx="6" cy="12" r="2.6" fill="#ecfeff" />
          <circle cx="18" cy="19" r="2.6" fill="#ecfeff" />
          <path d="M8.5 10.9l7-4.1M8.5 13.1l7 4.1" stroke="#ecfeff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'copy':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="8" y="8" width="11" height="11" rx="2.2" fill="#fef3c7" stroke="#92400e" strokeWidth="1.4" />
          <path d="M6 15.5H5.2A2.2 2.2 0 0 1 3 13.3V5.2A2.2 2.2 0 0 1 5.2 3h8.1A2.2 2.2 0 0 1 15.5 5.2V6" stroke="#fef3c7" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'wa':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M12.04 2a9.9 9.9 0 0 0-8.56 14.9L2.1 21.9l5.12-1.34A9.9 9.9 0 1 0 12.04 2zm5.66 13.3c-.25.7-1.45 1.28-2.01 1.36-.52.07-1.18.1-1.9-.12-.44-.13-1-.32-1.72-.63-3.03-1.31-5-4.36-5.15-4.56-.15-.2-1.25-1.66-1.25-3.17 0-1.5.79-2.24 1.07-2.55.28-.3.61-.38.81-.38h.59c.19 0 .45-.07.7.54.25.63.86 2.1.93 2.25.08.15.12.33.02.53-.1.2-.15.33-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.03 1.12 1 2.07 1.31 2.36 1.46.3.15.47.12.64-.07.17-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.75.83 2.05.98.3.15.5.22.57.35.08.12.08.72-.17 1.42z" />
        </svg>
      );
    case 'tg':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M21.8 4.3 3.55 11.4c-1.25.48-1.23 1.15-.22 1.45l4.68 1.46 1.8 5.5c.22.72.4.98 1.02.98.67 0 .96-.3 1.33-.67l2.55-2.47 5.3 3.91c.97.54 1.67.26 1.91-.9L23.3 5.6c.34-1.35-.49-1.94-1.5-1.3zM9.7 14.2l-.28 3.95 1.26-2.12 7.4-6.68c.33-.3-.07-.44-.5-.18L9.7 14.2z" />
        </svg>
      );
    case 'vb':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M11.9 2.1c4.9 0 8.9 3.3 8.9 7.5 0 2.6-1.3 4.9-3.4 6.4v3.3l-3.1-1.7c-.7.15-1.5.23-2.4.23-4.9 0-8.9-3.3-8.9-7.5s4-7.23 8.9-7.23zm.1 3.4c-.9 0-1.6.7-1.6 1.55v4.2c0 .85.7 1.55 1.6 1.55s1.6-.7 1.6-1.55v-4.2c0-.85-.7-1.55-1.6-1.55z" />
        </svg>
      );
    case 'line':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M12 3.2c-4.8 0-8.7 3.2-8.7 7.1 0 3.5 3.1 6.4 7.3 7 .3 0 .7.2.8.5l.5 1.7c.1.3.4.2.5.1 2.2-1.1 8.3-4.9 8.3-9.3 0-3.9-3.9-7.1-8.7-7.1zm-3.2 9.5H7.2c-.3 0-.5-.2-.5-.5V8.7c0-.3.2-.5.5-.5s.5.2.5.5v3h1.6c.3 0 .5.2.5.5s-.2.5-.5.5zm1.9-.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V8.7c0-.3.2-.5.5-.5s.5.2.5.5v3.5zm3.3.5h-2.1c-.3 0-.5-.2-.5-.5V8.7c0-.3.2-.5.5-.5h2.1c.3 0 .5.2.5.5s-.2.5-.5.5H12v.6h1.5c.3 0 .5.2.5.5s-.2.5-.5.5H12v.6h1.5c.3 0 .5.2.5.5s-.2.5-.5.5zm3.4 0h-1.6c-.3 0-.5-.2-.5-.5V8.7c0-.3.2-.5.5-.5s.5.2.5.5v3h1.1c.3 0 .5.2.5.5s-.2.5-.5.5z" />
        </svg>
      );
    case 'wechat':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M9.5 4.2c-3.9 0-7 2.6-7 5.8 0 1.9 1.1 3.5 2.8 4.6l-.5 1.9 2.2-1.1c.7.2 1.4.3 2.1.3.2 0 .4 0 .6-.1-.1-.4-.2-.9-.2-1.3 0-3.1 2.9-5.6 6.5-5.6.2 0 .5 0 .7.1C16.1 6.2 13.1 4.2 9.5 4.2zm-2.3 3.2a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7zm4.2 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7zM16.7 9.6c-3.2 0-5.8 2.1-5.8 4.7s2.6 4.7 5.8 4.7c.5 0 1-.1 1.5-.2l1.8.9-.4-1.5c1.3-.9 2.1-2.2 2.1-3.9 0-2.6-2.6-4.7-5-4.7zm-1.8 3.1a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4zm3.5 0a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4z" />
        </svg>
      );
    case 'qq':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M12.1 3.2c-1.6 0-3.1 1.4-3.4 3.5-.1.5-.1 1.5.1 2.3-1.6.7-2.7 2-2.7 3.5 0 .9.4 1.7 1.1 2.4-.3 1-.8 2.1-1.5 2.7-.2.2-.2.4 0 .5.3.2 1.2.6 2.2.3.6-.2 1.2-.5 1.7-.9.8.3 1.7.4 2.6.4s1.8-.1 2.6-.4c.5.4 1.1.7 1.7.9 1 .3 1.9-.1 2.2-.3.2-.1.2-.3 0-.5-.7-.6-1.2-1.7-1.5-2.7.7-.7 1.1-1.5 1.1-2.4 0-1.5-1.1-2.8-2.7-3.5.2-.8.2-1.8.1-2.3-.3-2.1-1.8-3.5-3.4-3.5z" />
        </svg>
      );
    case 'dc':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M20 5.5A15 15 0 0 0 15.2 4l-.7 1.3a13 13 0 0 0-5 0L8.8 4A15 15 0 0 0 4 5.5C2.2 8.2 1.6 13.2 2 17.2A15 15 0 0 0 6.8 20l1-1.3a10 10 0 0 1-1.5-.7l.3-.3c2.8 1.3 5.8 1.3 8.6 0l.3.3c-.5.3-1 .5-1.5.7l1 1.3A15 15 0 0 0 22 17.2c.4-4-.2-9-2-11.7zM9.5 14.5c-.8 0-1.5-.7-1.5-1.5S8.7 11.5 9.5 11.5 11 12.2 11 13s-.7 1.5-1.5 1.5zm5 0c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" />
        </svg>
      );
    case 'sms':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v8.5a1.5 1.5 0 0 1-1.5 1.5H9.2L5 20.2V17H4.5A1.5 1.5 0 0 1 3 15.5V7A1.5 1.5 0 0 1 4.5 5.5z" fill="#e0f2fe" stroke="#0c4a6e" strokeWidth="1.2" />
          <circle cx="8.2" cy="11.2" r="1.1" fill="#0369a1" />
          <circle cx="12" cy="11.2" r="1.1" fill="#0369a1" />
          <circle cx="15.8" cy="11.2" r="1.1" fill="#0369a1" />
        </svg>
      );
    case 'vk':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#fff" d="M12.785 16.24s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.019-1.304.586-1.496c.597-.19 1.361.968 2.17 1.396.614.324 1.078.252 1.078.252l2.162-.03s1.131-.07.595-.958c-.044-.072-.313-.657-1.608-1.856-1.356-1.256-1.174-.527.459-1.614 1.003-.666 1.404-1.074 1.279-1.322-.118-.236-.85-.174-.85-.174l-2.22.014s-.165-.022-.286.05c-.12.073-.194.24-.194.24s-.349.93-.815 1.72c-.98 1.67-1.372 1.76-1.532 1.657-.373-.24-.279-.966-.279-1.482 0-1.61.244-2.281-.476-2.455-.238-.057-.414-.095-1.027.007-.395.066-.63.2-.83.43-.27.31-.21.5-.21.5s.28.06.46.27c.24.28.23.9.23.9s.14 2.72-1.62.27c-1.48-1.43-2.64-4.86-2.64-4.86s-.1-.28-.36-.43c-.25-.14-.6-.1-.6-.1H5.42s-.4.01-.55.19c-.13.16.01.49.01.49s1.72 4.05 3.67 6.08c1.79 1.87 3.82 1.75 3.82 1.75h.91z" />
        </svg>
      );
    case 'gmail':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M3 6.2v11.3c0 .9.7 1.6 1.6 1.6H8V9.1l4 3 4-3V19h3.4c.9 0 1.6-.7 1.6-1.6V6.2l-9 6.6L3 6.2z" />
          <path fill="#34A853" d="M3 6.2 8 9.9V19H4.6C3.7 19 3 18.3 3 17.4V6.2z" />
          <path fill="#FBBC04" d="M21 6.2V17.4c0 .9-.7 1.6-1.6 1.6H16V9.9l5-3.7z" />
          <path fill="#EA4335" d="M21 6.2 12 12.8 3 6.2l1.2-1.1L12 10.6l7.8-5.5L21 6.2z" />
          <path fill="#C5221F" d="M3 6.2V5.4c0-.5.3-1 .8-1.2L12 9.4l8.2-5.2c.5.2.8.7.8 1.2v.8L12 12.8 3 6.2z" />
        </svg>
      );
    case 'mail':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2.5" fill="#fde68a" stroke="#78350f" strokeWidth="1.3" />
          <path d="M4.2 7.2 12 12.4l7.8-5.2" stroke="#78350f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function buildLobbyShareUrl(code: string): string | null {
  if (typeof window === 'undefined') return null;
  const c = code.trim().toUpperCase();
  if (!c) return null;
  try {
    const u = new URL(window.location.href);
    const path = u.pathname || '/';
    if (path === '/join' || path.startsWith('/join/')) {
      u.search = `?code=${encodeURIComponent(c)}`;
      u.hash = '';
      return u.toString();
    }
    if (path === '/play' || path.startsWith('/play/')) {
      u.pathname = path.endsWith('/') ? path : `${path}/`;
      u.search = `?code=${encodeURIComponent(c)}&autojoin=1`;
      u.hash = '';
      return u.toString();
    }
    u.pathname = '/';
    u.search = `?code=${encodeURIComponent(c)}&autojoin=1`;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}
