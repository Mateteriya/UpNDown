import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AUDIO_CHANNEL_META,
  LIVE_AUDIO_CHANNELS,
  getAudioSettings,
  patchAudioSettings,
  playPreviewSound,
  setAudioSettings,
  startVolumePreview,
  stopAllSounds,
  stopVolumePreview,
  subscribeAudioSettings,
  unlockAudio,
  type AudioSettings,
  type LiveAudioChannel,
  type SoundId,
} from '../audio';

const CHANNEL_TEST: Record<LiveAudioChannel, SoundId> = {
  mine: 'bid_place',
  others: 'deal_complete',
  ui: 'ui_tap',
  nudge: 'your_turn_nudge_short',
};

function isAudible(s: AudioSettings): boolean {
  return s.enabled && LIVE_AUDIO_CHANNELS.some((ch) => !s.muted[ch]);
}

type ToggleRenderArgs = {
  open: boolean;
  panelId: string;
  onToggle: () => void;
};

type Props = {
  className?: string;
  compact?: boolean;
  /** Свой триггер (меню аватарки) — штатная кнопка «Звук» скрывается. */
  renderToggle?: (args: ToggleRenderArgs) => ReactNode;
};

export function AudioSettingsPanel({ className, compact, renderToggle }: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const volIdleRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [settings, setLocal] = useState<AudioSettings>(() => getAudioSettings());

  useEffect(() => subscribeAudioSettings(setLocal), []);

  useEffect(() => {
    if (!open) return;
    unlockAudio();
    stopAllSounds();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.clearTimeout(volIdleRef.current);
      stopVolumePreview();
    };
  }, [open]);

  const apply = (next: AudioSettings) => {
    setAudioSettings(next);
    setLocal(next);
  };

  const toggleChannel = (ch: LiveAudioChannel, on: boolean) => {
    stopVolumePreview();
    apply(patchAudioSettings(settings, { muted: { [ch]: !on } }));
  };

  const hearChannel = (ch: LiveAudioChannel) => {
    if (!settings.enabled || settings.muted[ch]) return;
    unlockAudio();
    startVolumePreview(CHANNEL_TEST[ch], { channel: ch });
    window.clearTimeout(volIdleRef.current);
    volIdleRef.current = window.setTimeout(() => stopVolumePreview(), 800);
  };

  const hearMaster = () => {
    const ch = LIVE_AUDIO_CHANNELS.find((c) => !settings.muted[c]) ?? 'mine';
    hearChannel(ch);
  };

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="audio-settings-overlay"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              id={panelId}
              className="audio-settings__panel audio-settings__panel--modal"
              role="dialog"
              aria-modal="true"
              aria-label="Настройки звука и музыки"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="audio-settings__glow" aria-hidden />
              <p className="audio-settings__eyebrow">Канал связи</p>
              <div className="audio-settings__head">
                <h2 className="audio-settings__title">Звук и музыка</h2>
                <button
                  type="button"
                  className="audio-settings__close"
                  aria-label="Закрыть"
                  onClick={() => setOpen(false)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <label className="audio-settings__master">
                <span className="audio-settings__master-copy">
                  <span className="audio-settings__kicker">Эфир</span>
                  Все звуки
                </span>
                <span className="audio-settings__switch-wrap">
                  <input
                    type="checkbox"
                    className="audio-settings__switch-input"
                    checked={settings.enabled}
                    onChange={(e) => apply(patchAudioSettings(settings, { enabled: e.target.checked }))}
                  />
                  <span className="audio-settings__switch" aria-hidden />
                </span>
              </label>
              <input
                type="range"
                className="audio-settings__master-vol audio-settings__range"
                min={0}
                max={100}
                value={Math.round(settings.masterVolume * 100)}
                disabled={!settings.enabled}
                aria-label="Общая громкость"
                onPointerDown={hearMaster}
                onChange={(e) => {
                  apply(patchAudioSettings(settings, { masterVolume: Number(e.target.value) / 100 }));
                  hearMaster();
                }}
              />

              <p className="audio-settings__section">Что слышно</p>
              <div className="audio-settings-checks" role="group" aria-label="Каналы">
                {LIVE_AUDIO_CHANNELS.map((ch) => {
                  const meta = AUDIO_CHANNEL_META[ch];
                  const on = !settings.muted[ch];
                  const live = settings.enabled && on;
                  return (
                    <label
                      key={ch}
                      className={[
                        'audio-settings-row',
                        on ? 'audio-settings-row--on' : '',
                        !settings.enabled ? 'audio-settings-row--disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="audio-settings-check">
                        <input
                          type="checkbox"
                          className="audio-settings-check__input"
                          checked={on}
                          disabled={!settings.enabled}
                          aria-label={meta.label}
                          onChange={(e) => toggleChannel(ch, e.target.checked)}
                        />
                        <span className="audio-settings-check__box" aria-hidden>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M3.2 8.4l3.1 3.2 6.5-7.2"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </span>
                      <span className="audio-settings-row__copy">
                        <span className="audio-settings-row__name">{meta.label}</span>
                        <span className="audio-settings-row__hint">{meta.hint}</span>
                      </span>
                      <button
                        type="button"
                        className="audio-settings__test"
                        disabled={!live}
                        title={`Прослушать: ${meta.label}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          unlockAudio();
                          playPreviewSound(CHANNEL_TEST[ch], { channel: ch });
                        }}
                      >
                        ▶
                      </button>
                    </label>
                  );
                })}
                <div className="audio-settings-row audio-settings-row--soon" title={AUDIO_CHANNEL_META.music.hint}>
                  <span className="audio-settings-row__copy">
                    <span className="audio-settings-row__name">{AUDIO_CHANNEL_META.music.label}</span>
                    <span className="audio-settings-row__hint">{AUDIO_CHANNEL_META.music.hint}</span>
                  </span>
                  <span className="audio-settings-chip__soon">скоро</span>
                </div>
              </div>

              <details className="audio-settings__more">
                <summary>Громкость каналов</summary>
                <div className="audio-settings__vols">
                  {LIVE_AUDIO_CHANNELS.map((ch) => {
                    const meta = AUDIO_CHANNEL_META[ch];
                    return (
                      <label key={ch} className="audio-settings__vol-row">
                        <span>{meta.label}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(settings.volume[ch] * 100)}
                          disabled={!settings.enabled || settings.muted[ch]}
                          className="audio-settings__range"
                          aria-label={`Громкость: ${meta.label}`}
                          onPointerDown={() => hearChannel(ch)}
                          onChange={(e) => {
                            apply(
                              patchAudioSettings(settings, {
                                volume: { [ch]: Number(e.target.value) / 100 },
                              }),
                            );
                            hearChannel(ch);
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={['audio-settings', compact ? 'audio-settings--compact' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {renderToggle ? (
        renderToggle({ open, panelId, onToggle: () => setOpen((v) => !v) })
      ) : (
        <button
          type="button"
          className="audio-settings__toggle"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          title="Звук и музыка"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            {isAudible(settings) ? (
              <>
                <path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M15.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M18.5 6a9 9 0 010 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M22 9l-6 6M16 9l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </>
            )}
          </svg>
          {!compact ? <span>Звук</span> : null}
        </button>
      )}
      {panel}
    </div>
  );
}
