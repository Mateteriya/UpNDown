/**
 * Модалка «Имя и фото»: ввод имени и опциональная загрузка фото (Data URL).
 * ПК: селфи через getUserMedia; просмотр/зум аватара; полный AvatarEditor.
 * Мобилка: системная камера (capture). Галерея → picker без capture.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_AVATAR_IMAGE_SIZE_BYTES } from '../lib/avatarImage';
import {
  canUseInPageCamera,
  captureVideoElementDataUrl,
  openGalleryPicker,
  openNativeCameraPicker,
  preferNativeCameraPicker,
} from '../lib/avatarCamera';
import {
  clearNameAvatarModalOpen,
  markNameAvatarModalOpen,
  persistAvatarToProfile,
} from '../lib/profileAvatarSave';
import { PlayerAvatar } from './PlayerAvatar';
import { AvatarNeonColorPicker } from './AvatarNeonColorPicker';
import { AvatarEditorModal } from './AvatarEditorModal';
import { useT } from '../i18n';
import '../styles/name-avatar-modal.css';

export const MAX_DISPLAY_NAME_LENGTH = 17;
const MAX_NAME_LENGTH = MAX_DISPLAY_NAME_LENGTH;
const MAX_IMAGE_SIZE_BYTES = MAX_AVATAR_IMAGE_SIZE_BYTES;
const DEFAULT_AVATAR_BG = '#1a0033';
const PREVIEW_SCALE_MIN = 1;
const PREVIEW_SCALE_MAX = 2.6;
const PREVIEW_SCALE_STEP = 0.25;

export interface NameAvatarModalProps {
  initialDisplayName?: string;
  initialAvatarDataUrl?: string | null;
  initialAvatarBgColor?: string | null;
  /** Чтобы после камеры/перезагрузки вернуть ту же модалку (first-run / profile / …). */
  resumeMode?: 'first-run' | 'profile' | 'new-account';
  onConfirm: (profile: {
    displayName: string;
    avatarDataUrl?: string | null;
    avatarBgColor?: string | null;
  }) => void;
  onCancel?: () => void;
  title?: string;
  confirmLabel?: string;
  /** Сразу после выбора фото (камера на телефоне может перезагрузить страницу). */
  onPhotoCaptured?: (avatarDataUrl: string) => void;
}

export function NameAvatarModal({
  initialDisplayName = '',
  initialAvatarDataUrl = null,
  initialAvatarBgColor = null,
  resumeMode = 'profile',
  onConfirm,
  onCancel,
  title,
  confirmLabel,
  onPhotoCaptured,
}: NameAvatarModalProps) {
  const t = useT();
  const heading = title ?? t('nameAvatar.title');
  const saveLabel = confirmLabel ?? t('nameAvatar.save');
  const [displayName, setDisplayName] = useState(initialDisplayName.trim() || '');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(initialAvatarDataUrl ?? null);
  const [avatarBgColor, setAvatarBgColor] = useState<string>(
    initialAvatarBgColor && /^#[0-9A-Fa-f]{3,8}$/.test(initialAvatarBgColor.trim())
      ? initialAvatarBgColor.trim()
      : DEFAULT_AVATAR_BG,
  );
  const [bgNeon, setBgNeon] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [inPageCameraOpen, setInPageCameraOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewScale, setPreviewScale] = useState(1.35);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const syncVisualViewport = useCallback(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!root) return;
    const h = vv?.height ?? window.innerHeight;
    root.style.setProperty('--nam-vvh', `${Math.round(h)}px`);
  }, []);

  useEffect(() => {
    syncVisualViewport();
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener('resize', syncVisualViewport);
    vv.addEventListener('scroll', syncVisualViewport);
    return () => {
      vv.removeEventListener('resize', syncVisualViewport);
      vv.removeEventListener('scroll', syncVisualViewport);
    };
  }, [syncVisualViewport]);

  useEffect(() => {
    if (!inputFocused) return;
    syncVisualViewport();
    const id = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [inputFocused, syncVisualViewport]);

  const stopInPageCamera = useCallback(() => {
    for (const t of cameraStreamRef.current?.getTracks() ?? []) t.stop();
    cameraStreamRef.current = null;
    setInPageCameraOpen(false);
  }, []);

  useEffect(() => {
    if (!inPageCameraOpen) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        cameraStreamRef.current = stream;
        const video = cameraVideoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch (e) {
        setInPageCameraOpen(false);
        if (preferNativeCameraPicker()) {
          markNameAvatarModalOpen(resumeMode);
          openNativeCameraPicker(cameraInputRef.current);
        } else {
          setError(e instanceof Error ? e.message : t('nameAvatar.cameraFail'));
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const t of cameraStreamRef.current?.getTracks() ?? []) t.stop();
      cameraStreamRef.current = null;
    };
  }, [inPageCameraOpen, resumeMode]);

  useEffect(() => {
    return () => {
      for (const t of cameraStreamRef.current?.getTracks() ?? []) t.stop();
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!previewOpen && !avatarEditorOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (avatarEditorOpen) return;
      if (previewOpen) setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen, avatarEditorOpen]);

  const allowBackdropCloseRef = useRef(false);
  const backdropPointerDownRef = useRef(false);
  useEffect(() => {
    allowBackdropCloseRef.current = false;
    backdropPointerDownRef.current = false;
    const id = window.setTimeout(() => {
      allowBackdropCloseRef.current = true;
    }, 450);
    return () => window.clearTimeout(id);
  }, []);

  const applyPhotoDataUrl = async (dataUrl: string) => {
    setError(null);
    try {
      const compressed = await persistAvatarToProfile(dataUrl);
      setAvatarDataUrl(compressed);
      onPhotoCaptured?.(compressed);
    } catch {
      setAvatarDataUrl(dataUrl);
      onPhotoCaptured?.(dataUrl);
    }
  };

  const handleSelfie = () => {
    if (selfieBusy || inPageCameraOpen) return;
    setError(null);
    if (canUseInPageCamera() && !preferNativeCameraPicker()) {
      setInPageCameraOpen(true);
      return;
    }
    markNameAvatarModalOpen(resumeMode);
    openNativeCameraPicker(cameraInputRef.current);
  };

  const handleInPageCameraCapture = async () => {
    const video = cameraVideoRef.current;
    if (!video) return;
    setSelfieBusy(true);
    setError(null);
    try {
      await applyPhotoDataUrl(await captureVideoElementDataUrl(video));
      stopInPageCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('nameAvatar.shotFail'));
    } finally {
      setSelfieBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError(t('nameAvatar.needName'));
      return;
    }
    setError(null);
    stopInPageCamera();
    clearNameAvatarModalOpen();
    onConfirm({
      displayName: name.slice(0, MAX_NAME_LENGTH),
      avatarDataUrl: avatarDataUrl ?? null,
      avatarBgColor,
    });
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('nameAvatar.pickImage'));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(t('nameAvatar.fileTooBig', { n: Math.round(MAX_IMAGE_SIZE_BYTES / 1024 / 1024) }));
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      await applyPhotoDataUrl(reader.result as string);
    };
    reader.onerror = () => setError(t('nameAvatar.readFail'));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removePhoto = () => {
    setAvatarDataUrl(null);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const openPreview = () => {
    stopInPageCamera();
    setPreviewScale(1.35);
    setPreviewOpen(true);
  };

  const openEditor = () => {
    stopInPageCamera();
    setPreviewOpen(false);
    setAvatarEditorOpen(true);
  };

  const nameLen = displayName.length;

  return createPortal(
    <>
      <div
        ref={rootRef}
        className={['name-avatar-modal', inputFocused ? 'name-avatar-modal--input-focus' : '']
          .filter(Boolean)
          .join(' ')}
        onPointerDown={(e) => {
          backdropPointerDownRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          if (!allowBackdropCloseRef.current) return;
          if (!backdropPointerDownRef.current) return;
          backdropPointerDownRef.current = false;
          stopInPageCamera();
          onCancel?.();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-avatar-modal-title"
      >
        <div
          ref={panelRef}
          className="name-avatar-modal__panel"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="name-avatar-modal-title" className="name-avatar-modal__title">
            {heading}
          </h2>
          <form className="name-avatar-modal__form" onSubmit={handleSubmit}>
            <div className="name-avatar-modal__identity">
              <div className="name-avatar-modal__avatar-col">
                <button
                  type="button"
                  className="name-avatar-modal__avatar-hit"
                  onClick={openPreview}
                  title={t('nameAvatar.zoomAvatar')}
                  aria-label={t('nameAvatar.zoomAvatar')}
                >
                  <span className="name-avatar-modal__avatar-ring">
                    <PlayerAvatar
                      name={displayName || '?'}
                      avatarDataUrl={avatarDataUrl}
                      avatarBgColor={avatarBgColor}
                      sizePx={112}
                    />
                  </span>
                  <span className="name-avatar-modal__avatar-zoom-hint">{t('nameAvatar.zoomHint')}</span>
                </button>
                {!avatarDataUrl ? (
                  <div className="name-avatar-modal__bg-palette" aria-label={t('nameAvatar.bgColor')}>
                    <AvatarNeonColorPicker
                      color={avatarBgColor}
                      onChange={setAvatarBgColor}
                      neonBrush={bgNeon}
                      onNeonBrushChange={setBgNeon}
                      hideExternalModeToggle
                      className="name-avatar-modal__color-picker"
                    />
                  </div>
                ) : (
                  <p className="name-avatar-modal__bg-note">{t('nameAvatar.bgNote')}</p>
                )}
              </div>
              <div className="name-avatar-modal__name-block">
                <div className="name-avatar-modal__name-meta">
                  <span className="name-avatar-modal__hint">{t('nameAvatar.nameInGame')}</span>
                  <span className="name-avatar-modal__count" aria-live="polite">
                    {nameLen}/{MAX_NAME_LENGTH}
                  </span>
                </div>
                <input
                  id="name-avatar-input"
                  className="name-avatar-modal__input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder={t('nameAvatar.tapToType')}
                  enterKeyHint="done"
                  autoComplete="nickname"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {inPageCameraOpen ? (
              <div className="name-avatar-modal__camera" role="region" aria-label={t('nameAvatar.selfieRegion')}>
                <video
                  ref={cameraVideoRef}
                  className="name-avatar-modal__camera-video"
                  playsInline
                  muted
                  autoPlay
                />
                <div className="name-avatar-modal__camera-actions">
                  <button
                    type="button"
                    className="name-avatar-modal__chip name-avatar-modal__chip--remove"
                    onClick={stopInPageCamera}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="name-avatar-modal__chip name-avatar-modal__chip--selfie"
                    disabled={selfieBusy}
                    onClick={() => void handleInPageCameraCapture()}
                  >
                    {selfieBusy ? '…' : t('nameAvatar.shoot')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="name-avatar-modal__photo-row">
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  style={{ display: 'none' }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleImageFileChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="name-avatar-modal__chip name-avatar-modal__chip--selfie"
                  disabled={selfieBusy}
                  onClick={handleSelfie}
                  title={t('nameAvatar.makeSelfie')}
                >
                  {selfieBusy ? t('nameAvatar.cameraBusy') : t('nameAvatar.selfie')}
                </button>
                <button
                  type="button"
                  className="name-avatar-modal__chip name-avatar-modal__chip--gallery"
                  onClick={() => openGalleryPicker(galleryInputRef.current)}
                  title={t('nameAvatar.fromDevice')}
                >
                  {t('nameAvatar.gallery')}
                </button>
                <button
                  type="button"
                  className="name-avatar-modal__chip name-avatar-modal__chip--editor"
                  onClick={openEditor}
                  title={t('nameAvatar.fullEditor')}
                >
                  {t('nameAvatar.editorShort')}
                </button>
                {avatarDataUrl ? (
                  <button
                    type="button"
                    className="name-avatar-modal__chip name-avatar-modal__chip--remove"
                    onClick={removePhoto}
                  >
                    {t('nameAvatar.removePhoto')}
                  </button>
                ) : null}
              </div>
            )}

            {error ? <p className="name-avatar-modal__error">{error}</p> : null}

            <div className="name-avatar-modal__actions">
              {onCancel ? (
                <button
                  type="button"
                  className="name-avatar-modal__btn name-avatar-modal__btn--ghost"
                  onClick={() => {
                    stopInPageCamera();
                    clearNameAvatarModalOpen();
                    onCancel();
                  }}
                >
                  {t('common.cancel')}
                </button>
              ) : null}
              <button type="submit" className="name-avatar-modal__btn name-avatar-modal__btn--primary">
                {saveLabel}
              </button>
            </div>
          </form>
        </div>
      </div>

      {previewOpen ? (
        <div
          className="name-avatar-modal__preview"
          role="dialog"
          aria-modal="true"
          aria-label={t('nameAvatar.previewAria')}
          onClick={() => setPreviewOpen(false)}
        >
          <div className="name-avatar-modal__preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="name-avatar-modal__preview-stage">
              <div
                className="name-avatar-modal__preview-zoom"
                style={{ transform: `scale(${previewScale})` }}
              >
                <PlayerAvatar
                  name={displayName || '?'}
                  avatarDataUrl={avatarDataUrl}
                  avatarBgColor={avatarBgColor}
                  sizePx={260}
                />
              </div>
            </div>
            <div className="name-avatar-modal__preview-controls">
              <button
                type="button"
                className="name-avatar-modal__chip name-avatar-modal__chip--gallery"
                onClick={() =>
                  setPreviewScale((s) => Math.max(PREVIEW_SCALE_MIN, +(s - PREVIEW_SCALE_STEP).toFixed(2)))
                }
                aria-label={t('nameAvatar.zoomOut')}
              >
                −
              </button>
              <span className="name-avatar-modal__preview-scale">{Math.round(previewScale * 100)}%</span>
              <button
                type="button"
                className="name-avatar-modal__chip name-avatar-modal__chip--gallery"
                onClick={() =>
                  setPreviewScale((s) => Math.min(PREVIEW_SCALE_MAX, +(s + PREVIEW_SCALE_STEP).toFixed(2)))
                }
                aria-label={t('nameAvatar.zoomIn')}
              >
                +
              </button>
              <button
                type="button"
                className="name-avatar-modal__chip name-avatar-modal__chip--editor"
                onClick={openEditor}
              >
                {t('nameAvatar.editorShort')}
              </button>
              <button
                type="button"
                className="name-avatar-modal__chip name-avatar-modal__chip--remove"
                onClick={() => setPreviewOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {avatarEditorOpen ? (
        <AvatarEditorModal
          displayName={displayName.trim() || '?'}
          initialAvatarDataUrl={avatarDataUrl}
          onPhotoCaptured={(url) => {
            setAvatarDataUrl(url);
            onPhotoCaptured?.(url);
          }}
          onSave={(url) => {
            setAvatarDataUrl(url);
            if (url) onPhotoCaptured?.(url);
            setAvatarEditorOpen(false);
          }}
          onCancel={() => setAvatarEditorOpen(false)}
        />
      ) : null}
    </>,
    document.body,
  );
}
