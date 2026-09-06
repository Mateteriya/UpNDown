/**
 * Редактор аватарки: превью, шаблоны, рисование, стикеры, рамки, 3D-финиш, палитра.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AVATAR_EDITOR_TEMPLATES,
  drawAvatarTemplate,
  drawInitialsBase,
  drawPhotoWithTransform,
  type AvatarEditorTemplateId,
} from '../lib/avatarEditorTemplates';
import {
  AVATAR_EDITOR_STICKERS,
  drawAvatarSticker,
  type AvatarStickerId,
} from '../lib/avatarEditorStickers';
import {
  AVATAR_EDITOR_FRAMES,
  drawAvatarFrameOnLayer,
  loadAvatarFrameImage,
  type AvatarFrameId,
} from '../lib/avatarEditorFrames';
import { bake3dPolishToBase } from '../lib/avatar3dFinish';
import {
  compressImageToDataUrl,
  exportCircularAvatarJpeg,
  MAX_AVATAR_IMAGE_SIZE_BYTES,
} from '../lib/avatarImage';
import { paintNeonBrushStroke } from '../lib/avatarNeonBrush';
import {
  canUseInPageCamera,
  captureSelfieDataUrl,
  captureVideoElementDataUrl,
  openGalleryPicker,
  openNativeCameraPicker,
  preferNativeCameraPicker,
} from '../lib/avatarCamera';
import { persistAvatarToProfile } from '../lib/profileAvatarSave';
import { AvatarEditorChipRail } from './avatarEditor/AvatarEditorChipRail';
import { AvatarPolishGlyph } from './icons/AvatarPolishGlyph';
import { AvatarNeonColorPicker, BRUSH_QUICK_COLORS } from './AvatarNeonColorPicker';
import { getPlayerAvatarInitials } from './PlayerAvatar';
import { useDesktopProfileUi } from './useDesktopProfileUi';
import { useT, type TFunc } from '../i18n';

const CANVAS_SIZE = 512;
const MAX_UNDO = 24;

const BRUSH_SIZES = [4, 8, 14] as const;

function templateLabel(id: AvatarEditorTemplateId, tr: TFunc): string {
  switch (id) {
    case 'nebula':
      return tr('avatarEditor.nebula');
    case 'aurora':
      return tr('avatarEditor.aurora');
    case 'ember':
      return tr('avatarEditor.ember');
    case 'violet-crown':
      return tr('avatarEditor.violetCrown');
    case 'deep-space':
      return tr('avatarEditor.deepSpace');
    case 'prism':
      return tr('avatarEditor.prism');
    default:
      return tr('avatarEditor.none');
  }
}

function stickerLabel(id: AvatarStickerId, tr: TFunc): string {
  if (id === 'spade') return tr('avatarEditor.stickerSpade');
  if (id === 'heart') return tr('avatarEditor.stickerHeart');
  if (id === 'diamond') return tr('avatarEditor.stickerDiamond');
  if (id === 'club') return tr('avatarEditor.stickerClub');
  if (id === 'star') return tr('avatarEditor.stickerStar');
  if (id === 'sparkle') return tr('avatarEditor.stickerSparkle');
  return tr('avatarEditor.stickerRing');
}

function frameLabel(id: AvatarFrameId, tr: TFunc): string {
  if (id === 'cosmic') return tr('avatarEditor.frameCosmic');
  if (id === 'gold') return tr('avatarEditor.frameGold');
  if (id === 'neon') return tr('avatarEditor.frameNeon');
  if (id === 'orbit') return tr('avatarEditor.frameOrbit');
  return id;
}

type EditorTool = 'brush' | 'eraser' | 'sticker' | 'photo';

type EditorMeta = {
  baseMode: 'template' | 'photo' | 'initials';
  templateId: AvatarEditorTemplateId;
  photoDataUrl: string | null;
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
  polishApplied: boolean;
};

type UndoEntry =
  | { kind: 'draw'; draw: ImageData }
  | { kind: 'all'; base: ImageData; draw: ImageData; meta: EditorMeta };

const PHOTO_SCALE_MIN = 0.35;
const PHOTO_SCALE_MAX = 2.8;

function getInitials(name: string): string {
  return getPlayerAvatarInitials(name);
}

export interface AvatarEditorModalProps {
  displayName: string;
  initialAvatarDataUrl?: string | null;
  onSave: (avatarDataUrl: string | null) => void;
  onCancel: () => void;
  /** Сразу после выбора/селфи — до «Сохранить» (камера на телефоне часто перезагружает вкладку). */
  onPhotoCaptured?: (avatarDataUrl: string) => void;
}

export function AvatarEditorModal({
  displayName,
  initialAvatarDataUrl = null,
  onSave,
  onCancel,
  onPhotoCaptured,
}: AvatarEditorModalProps) {
  const tr = useT();
  const isDesktopProfileUi = useDesktopProfileUi();
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const drawingRef = useRef(false);
  const undoPushedForStrokeRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const photoPanRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const photoImageCacheRef = useRef<{ url: string; img: HTMLImageElement } | null>(null);

  const [templateId, setTemplateId] = useState<AvatarEditorTemplateId>('nebula');
  const [baseMode, setBaseMode] = useState<'template' | 'photo' | 'initials'>(
    initialAvatarDataUrl ? 'photo' : 'template',
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(initialAvatarDataUrl);
  const [photoScale, setPhotoScale] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [brushColor, setBrushColor] = useState<string>(BRUSH_QUICK_COLORS[0]);
  const [brushNeon, setBrushNeon] = useState(true);
  const [brushSize, setBrushSize] = useState<number>(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<EditorTool>('brush');
  const [stickerId, setStickerId] = useState<AvatarStickerId>('star');
  const [activeFrameId, setActiveFrameId] = useState<AvatarFrameId | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [polishApplied, setPolishApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [inPageCameraOpen, setInPageCameraOpen] = useState(false);

  const ensureBuffers = useCallback(() => {
    if (!baseCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE;
      baseCanvasRef.current = c;
    }
    if (!drawCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE;
      drawCanvasRef.current = c;
    }
    return { base: baseCanvasRef.current, draw: drawCanvasRef.current };
  }, []);

  const compositeToDisplay = useCallback(() => {
    const display = displayCanvasRef.current;
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!display || !base || !draw) return;
    const ctx = display.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(draw, 0, 0);
  }, []);

  const getEditorMeta = useCallback(
    (): EditorMeta => ({
      baseMode,
      templateId,
      photoDataUrl,
      photoScale,
      photoOffsetX,
      photoOffsetY,
      polishApplied,
    }),
    [baseMode, templateId, photoDataUrl, photoScale, photoOffsetX, photoOffsetY, polishApplied],
  );

  const restoreEditorMeta = useCallback((meta: EditorMeta) => {
    setBaseMode(meta.baseMode);
    setTemplateId(meta.templateId);
    setPhotoDataUrl(meta.photoDataUrl);
    setPhotoScale(meta.photoScale);
    setPhotoOffsetX(meta.photoOffsetX);
    setPhotoOffsetY(meta.photoOffsetY);
    setPolishApplied(meta.polishApplied);
    if (meta.photoDataUrl !== photoImageCacheRef.current?.url) {
      photoImageCacheRef.current = null;
    }
  }, []);

  const clearRedo = useCallback(() => {
    redoStackRef.current = [];
    setCanRedo(false);
  }, []);

  const captureFullState = useCallback((): UndoEntry | null => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return null;
    const bCtx = base.getContext('2d');
    const dCtx = draw.getContext('2d');
    if (!bCtx || !dCtx) return null;
    return {
      kind: 'all',
      base: bCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      draw: dCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      meta: getEditorMeta(),
    };
  }, [getEditorMeta]);

  const applyHistoryEntry = useCallback(
    (snap: UndoEntry) => {
      const base = baseCanvasRef.current;
      const draw = drawCanvasRef.current;
      if (!base || !draw) return;
      const bCtx = base.getContext('2d');
      const dCtx = draw.getContext('2d');
      if (!bCtx || !dCtx) return;
      if (snap.kind === 'all') {
        bCtx.putImageData(snap.base, 0, 0);
        dCtx.putImageData(snap.draw, 0, 0);
        restoreEditorMeta(snap.meta);
      } else {
        dCtx.putImageData(snap.draw, 0, 0);
      }
      compositeToDisplay();
    },
    [restoreEditorMeta, compositeToDisplay],
  );

  const pushUndoDraw = useCallback(() => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    clearRedo();
    undoStackRef.current.push({ kind: 'draw', draw: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, [clearRedo]);

  const pushUndoAll = useCallback(() => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return;
    const bCtx = base.getContext('2d');
    const dCtx = draw.getContext('2d');
    if (!bCtx || !dCtx) return;
    clearRedo();
    undoStackRef.current.push({
      kind: 'all',
      base: bCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      draw: dCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      meta: getEditorMeta(),
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, [getEditorMeta, clearRedo]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const current = captureFullState();
    if (!current) return;
    redoStackRef.current.push(current);
    if (redoStackRef.current.length > MAX_UNDO) redoStackRef.current.shift();

    const snap = undoStackRef.current.pop()!;
    applyHistoryEntry(snap);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [captureFullState, applyHistoryEntry]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const current = captureFullState();
    if (!current) return;
    undoStackRef.current.push(current);
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();

    const snap = redoStackRef.current.pop()!;
    applyHistoryEntry(snap);
    setCanRedo(redoStackRef.current.length > 0);
    setCanUndo(true);
  }, [captureFullState, applyHistoryEntry]);

  const loadPhotoImage = useCallback((url: string) => {
    if (photoImageCacheRef.current?.url === url) {
      return Promise.resolve(photoImageCacheRef.current.img);
    }
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        photoImageCacheRef.current = { url, img };
        resolve(img);
      };
      img.onerror = () => reject(new Error('photo'));
      img.src = url;
    });
  }, []);

  const redrawBase = useCallback(async () => {
    const { base } = ensureBuffers();
    const ctx = base.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (baseMode === 'photo' && photoDataUrl) {
      try {
        const img = await loadPhotoImage(photoDataUrl);
        drawAvatarTemplate(ctx, CANVAS_SIZE, templateId, displayName);
        drawPhotoWithTransform(ctx, CANVAS_SIZE, img, photoScale, photoOffsetX, photoOffsetY);
      } catch {
        drawAvatarTemplate(ctx, CANVAS_SIZE, templateId, displayName);
      }
    } else if (baseMode === 'initials') {
      drawInitialsBase(ctx, CANVAS_SIZE, displayName, getInitials(displayName));
    } else {
      drawAvatarTemplate(ctx, CANVAS_SIZE, templateId, displayName);
    }
    compositeToDisplay();
  }, [
    baseMode,
    photoDataUrl,
    templateId,
    displayName,
    photoScale,
    photoOffsetX,
    photoOffsetY,
    ensureBuffers,
    compositeToDisplay,
    loadPhotoImage,
  ]);

  useEffect(() => {
    const display = displayCanvasRef.current;
    if (display) {
      display.width = CANVAS_SIZE;
      display.height = CANVAS_SIZE;
    }
    ensureBuffers();
    void redrawBase();
  }, [ensureBuffers, redrawBase]);

  const selectTemplate = (id: AvatarEditorTemplateId) => {
    pushUndoAll();
    setTemplateId(id);
    if (photoDataUrl) {
      setBaseMode('photo');
    } else {
      setBaseMode('template');
    }
    setPolishApplied(false);
    setError(null);
  };

  const useInitialsBase = () => {
    pushUndoAll();
    setBaseMode('initials');
    setPolishApplied(false);
    setError(null);
  };

  const restorePhotoMode = () => {
    if (!photoDataUrl) return;
    pushUndoAll();
    setBaseMode('photo');
    setTool('photo');
    setPolishApplied(false);
    setError(null);
  };

  const handleRemovePhoto = () => {
    pushUndoAll();
    setPhotoDataUrl(null);
    photoImageCacheRef.current = null;
    setPhotoScale(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setBaseMode('template');
    setPolishApplied(false);
    if (selfieInputRef.current) selfieInputRef.current.value = '';
  };

  const changePhotoScale = (delta: number) => {
    if (!photoDataUrl || baseMode !== 'photo') return;
    pushUndoAll();
    setPhotoScale((s) => Math.min(PHOTO_SCALE_MAX, Math.max(PHOTO_SCALE_MIN, Math.round((s + delta) * 100) / 100)));
  };

  const clearDrawing = () => {
    pushUndoDraw();
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    compositeToDisplay();
  };

  const applyFrame = async (frameId: AvatarFrameId) => {
    const def = AVATAR_EDITOR_FRAMES.find((f) => f.id === frameId);
    if (!def) return;
    setError(null);
    setActiveFrameId(frameId);
    try {
      const img = await loadAvatarFrameImage(def.src);
      pushUndoDraw();
      const draw = drawCanvasRef.current;
      const ctx = draw?.getContext('2d');
      if (!ctx) return;
      drawAvatarFrameOnLayer(ctx, CANVAS_SIZE, img);
      compositeToDisplay();
    } catch {
      setError(tr('avatarEditor.frameFail'));
    }
  };

  const apply3dPolish = () => {
    const { base, draw } = ensureBuffers();
    pushUndoAll();
    bake3dPolishToBase(base, draw, CANVAS_SIZE);
    setPolishApplied(true);
    compositeToDisplay();
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  };

  const placeSticker = (x: number, y: number) => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    drawAvatarSticker(ctx, x, y, stickerId, brushColor, 1);
    compositeToDisplay();
  };

  const strokeTo = (x: number, y: number) => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    const last = lastPointRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = brushColor;
    }
    ctx.beginPath();
    if (last) {
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
    }
    if (tool === 'eraser') {
      ctx.stroke();
    } else if (brushNeon) {
      paintNeonBrushStroke(ctx, brushColor, brushSize);
    } else {
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    lastPointRef.current = { x, y };
    compositeToDisplay();
  };

  const endStroke = () => {
    drawingRef.current = false;
    undoPushedForStrokeRef.current = false;
    lastPointRef.current = null;
    photoPanRef.current = null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = canvasPoint(e.clientX, e.clientY);
    if (!p) return;

    if (tool === 'sticker') {
      pushUndoDraw();
      placeSticker(p.x, p.y);
      return;
    }

    if (tool === 'photo' && photoDataUrl && baseMode === 'photo') {
      pushUndoAll();
      photoPanRef.current = { startX: p.x, startY: p.y, ox: photoOffsetX, oy: photoOffsetY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    if (!undoPushedForStrokeRef.current) {
      pushUndoDraw();
      undoPushedForStrokeRef.current = true;
    }
    strokeTo(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'photo' && photoPanRef.current) {
      const p = canvasPoint(e.clientX, e.clientY);
      if (!p) return;
      const pan = photoPanRef.current;
      setPhotoOffsetX(pan.ox + (p.x - pan.startX));
      setPhotoOffsetY(pan.oy + (p.y - pan.startY));
      return;
    }
    if (!drawingRef.current || tool === 'sticker') return;
    const p = canvasPoint(e.clientX, e.clientY);
    if (p) strokeTo(p.x, p.y);
  };

  const applyPhotoDataUrl = (dataUrl: string) => {
    pushUndoAll();
    setError(null);
    setPolishApplied(false);
    photoImageCacheRef.current = null;
    setPhotoDataUrl(dataUrl);
    setBaseMode('photo');
    setPhotoScale(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setTool('photo');
    void persistAvatarToProfile(dataUrl)
      .then((compressed) => {
        onPhotoCaptured?.(compressed);
      })
      .catch(() => {
        onPhotoCaptured?.(dataUrl);
      });
  };

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
          openNativeCameraPicker(selfieInputRef.current);
        } else {
          setError(e instanceof Error ? e.message : tr('nameAvatar.cameraFail'));
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const t of cameraStreamRef.current?.getTracks() ?? []) t.stop();
      cameraStreamRef.current = null;
    };
  }, [inPageCameraOpen]);

  const handleSelfie = async () => {
    if (selfieBusy || saving || inPageCameraOpen) return;
    if (canUseInPageCamera()) {
      setError(null);
      setInPageCameraOpen(true);
      return;
    }
    if (preferNativeCameraPicker()) {
      openNativeCameraPicker(selfieInputRef.current);
      return;
    }
    setSelfieBusy(true);
    setError(null);
    try {
      const dataUrl = await captureSelfieDataUrl();
      applyPhotoDataUrl(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('nameAvatar.cameraFail'));
    } finally {
      setSelfieBusy(false);
    }
  };

  const handleInPageCameraCapture = async () => {
    const video = cameraVideoRef.current;
    if (!video) return;
    setSelfieBusy(true);
    setError(null);
    try {
      applyPhotoDataUrl(await captureVideoElementDataUrl(video));
      stopInPageCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('nameAvatar.shotFail'));
    } finally {
      setSelfieBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(tr('avatarEditor.pickImage'));
      return;
    }
    if (file.size > MAX_AVATAR_IMAGE_SIZE_BYTES) {
      setError(tr('nameAvatar.fileTooBig', { n: Math.round(MAX_AVATAR_IMAGE_SIZE_BYTES / 1024 / 1024) }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      applyPhotoDataUrl(reader.result as string);
    };
    reader.onerror = () => setError(tr('nameAvatar.readFail'));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return;
    setSaving(true);
    setError(null);
    try {
      let out = exportCircularAvatarJpeg(base, draw);
      out = await compressImageToDataUrl(out);
      onSave(out);
    } catch {
      setError(tr('avatarEditor.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  const selectBrushColor = (c: string) => {
    setTool('brush');
    setBrushColor(c);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCancel();
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        handleUndo();
      }
      if (mod && (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey))) {
        ev.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, handleUndo, handleRedo]);

  const canvasCursor =
    tool === 'sticker' ? 'copy' : tool === 'photo' ? 'grab' : tool === 'eraser' ? 'cell' : 'crosshair';
  const hintText =
    tool === 'photo'
      ? tr('avatarEditor.hintDrag')
      : tool === 'sticker'
        ? tr('avatarEditor.hintSticker')
        : photoDataUrl && baseMode === 'photo'
          ? tr('avatarEditor.hintPhotoBg')
          : polishApplied
            ? tr('avatarEditor.hintPolish')
            : tr('avatarEditor.hintDraw');

  return createPortal(
    <div
      className={[
        'avatar-editor-modal-backdrop',
        isDesktopProfileUi ? 'avatar-editor-modal-backdrop--desktop' : '',
      ].join(' ')}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      role="presentation"
    >
      <div
        className={[
          'avatar-editor-modal-card',
          isDesktopProfileUi ? 'avatar-editor-modal-card--desktop' : '',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="avatar-editor-modal-card__glow" aria-hidden />
        {isDesktopProfileUi ? (
          <>
            <div className="avatar-editor-modal-card__aurora" aria-hidden />
            <div className="avatar-editor-modal-card__stars" aria-hidden />
            <div className="avatar-editor-modal-card__hud" aria-hidden />
          </>
        ) : null}
        <button type="button" className="avatar-editor-modal-close" onClick={onCancel} aria-label={tr('common.close')}>
          ×
        </button>
        <div className="avatar-editor-hero">
          <h2 id="avatar-editor-title" className="avatar-editor-modal-card__title">
            {tr('avatarEditor.title')}
          </h2>
          <div className="avatar-editor-hero__wing avatar-editor-hero__wing--left">
            <button
              type="button"
              className="avatar-editor-history-btn avatar-editor-hero__slot avatar-editor-hero__slot--top"
              onClick={handleUndo}
              disabled={!canUndo}
              title={tr('avatarEditor.backTitle')}
              aria-label={tr('avatarEditor.back')}
            >
              <span className="avatar-editor-history-btn__icon" aria-hidden>
                ↶
              </span>
              <span className="avatar-editor-history-btn__label">{tr('avatarEditor.back')}</span>
            </button>
            <p className="avatar-editor-hero__eyebrow avatar-editor-hero__slot avatar-editor-hero__slot--mid">{tr('avatarEditor.avatar')}</p>
            <button
              type="button"
              className="avatar-editor-history-btn avatar-editor-hero__slot avatar-editor-hero__slot--bottom"
              onClick={handleRedo}
              disabled={!canRedo}
              title={tr('avatarEditor.forwardTitle')}
              aria-label={tr('avatarEditor.forward')}
            >
              <span className="avatar-editor-history-btn__icon" aria-hidden>
                ↷
              </span>
              <span className="avatar-editor-history-btn__label">{tr('avatarEditor.forward')}</span>
            </button>
          </div>
          <div className="avatar-editor-preview-ring avatar-editor-hero__canvas">
            <canvas
              ref={displayCanvasRef}
              className="avatar-editor-canvas"
              style={{ cursor: canvasCursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              aria-label={tr('avatarEditor.canvas')}
            />
          </div>
          <div className="avatar-editor-hero__wing avatar-editor-hero__wing--right">
            <button
              type="button"
              className="avatar-editor-clear-btn avatar-editor-hero__slot avatar-editor-hero__slot--top"
              onClick={clearDrawing}
              title={tr('avatarEditor.clearTitle')}
              aria-label={tr('avatarEditor.clear')}
            >
              <span className="avatar-editor-clear-btn__label">{tr('avatarEditor.clear')}</span>
            </button>
            <button
              type="button"
              className={[
                'avatar-editor-3d-btn',
                'avatar-editor-hero__slot',
                'avatar-editor-hero__slot--bottom',
                polishApplied ? 'avatar-editor-3d-btn--applied' : '',
              ].join(' ')}
              onClick={apply3dPolish}
              title={tr('avatarEditor.polishTitle')}
              aria-label={tr('avatarEditor.polish')}
            >
              <AvatarPolishGlyph className="avatar-editor-3d-btn__glyph" />
            </button>
          </div>
          <div className="avatar-editor-preview-meta avatar-editor-hero__meta">
            <p className="avatar-editor-preview-hint">{hintText}</p>
            {photoDataUrl && baseMode === 'photo' && (
              <div className="avatar-editor-photo-toolbar">
                <button
                  type="button"
                  className={['avatar-editor-photo-tool-btn', tool === 'photo' ? 'avatar-editor-photo-tool-btn--active' : ''].join(' ')}
                  onClick={() => setTool('photo')}
                >
                  {tr('avatarEditor.position')}
                </button>
                <button type="button" className="avatar-editor-photo-zoom-btn" onClick={() => changePhotoScale(-0.08)} aria-label={tr('nameAvatar.zoomOut')}>
                  −
                </button>
                <span className="avatar-editor-photo-zoom-label">{Math.round(photoScale * 100)}%</span>
                <button type="button" className="avatar-editor-photo-zoom-btn" onClick={() => changePhotoScale(0.08)} aria-label={tr('nameAvatar.zoomIn')}>
                  +
                </button>
              </div>
            )}
          </div>
          {photoDataUrl && baseMode !== 'photo' && (
            <button type="button" className="avatar-editor-restore-photo-btn avatar-editor-hero__restore-photo" onClick={restorePhotoMode}>
              {tr('avatarEditor.restorePhoto')}
            </button>
          )}
        </div>

        <div className="avatar-editor-modal-body">
        <div className="avatar-editor-block avatar-editor-modal-body__bg">
          <span className="avatar-editor-section-label">{tr('avatarEditor.bg')}</span>
          <div className="avatar-editor-templates" role="list">
            {AVATAR_EDITOR_TEMPLATES.map((tpl) => {
              const label = templateLabel(tpl.id, tr);
              return (
              <button
                key={tpl.id}
                type="button"
                role="listitem"
                className={[
                  'avatar-editor-template-chip',
                  templateId === tpl.id && (baseMode === 'template' || baseMode === 'photo')
                    ? 'avatar-editor-template-chip--active'
                    : '',
                  `avatar-editor-template-chip--${tpl.id}`,
                ].join(' ')}
                onClick={() => selectTemplate(tpl.id)}
                title={label}
              >
                <span className="avatar-editor-template-chip__label">{label}</span>
              </button>
              );
            })}
            <button
              type="button"
              className={['avatar-editor-template-chip', 'avatar-editor-template-chip--initials', baseMode === 'initials' ? 'avatar-editor-template-chip--active' : ''].join(' ')}
              onClick={useInitialsBase}
              title={tr('avatarEditor.initials')}
            >
              <span className="avatar-editor-template-chip__label">{getInitials(displayName)}</span>
            </button>
          </div>
        </div>

        <div className="avatar-editor-block avatar-editor-tools avatar-editor-modal-body__tools">
          <span className="avatar-editor-section-label">{tr('avatarEditor.brush')}</span>
          <div className={['avatar-editor-tools-line', brushNeon ? '' : 'avatar-editor-tools-line--flat-brush'].filter(Boolean).join(' ')}>
            {BRUSH_QUICK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={[
                  'avatar-editor-color',
                  brushNeon ? '' : 'avatar-editor-color--flat',
                  tool !== 'eraser' && brushColor === c ? 'avatar-editor-color--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ background: c }}
                onClick={() => selectBrushColor(c)}
                aria-label={tr('avatarEditor.colorOf', { c })}
              />
            ))}
            <AvatarNeonColorPicker
              color={brushColor}
              onChange={selectBrushColor}
              neonBrush={brushNeon}
              onNeonBrushChange={setBrushNeon}
            />
            {BRUSH_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={['avatar-editor-size', tool !== 'sticker' && brushSize === s ? 'avatar-editor-size--active' : ''].join(' ')}
                onClick={() => {
                  setTool('brush');
                  setBrushSize(s);
                }}
                title={tr('avatarEditor.brushSize', { n: s })}
                aria-label={tr('avatarEditor.brushSize', { n: s })}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              className={['avatar-editor-tool-toggle', tool === 'eraser' ? 'avatar-editor-tool-toggle--active' : ''].join(' ')}
              onClick={() => setTool(tool === 'eraser' ? 'brush' : 'eraser')}
              title={tr('avatarEditor.eraserTitle')}
              aria-label={tr('avatarEditor.eraser')}
            >
              {tr('avatarEditor.eraser')}
            </button>
          </div>
        </div>

        <div className="avatar-editor-block avatar-editor-decor avatar-editor-modal-body__decor">
          <span className="avatar-editor-section-label">{tr('avatarEditor.framesStickers')}</span>
          <AvatarEditorChipRail
            collapsedVisible={isDesktopProfileUi ? AVATAR_EDITOR_FRAMES.length + AVATAR_EDITOR_STICKERS.length : 6}
            className="avatar-editor-decor-rail"
          >
            {AVATAR_EDITOR_FRAMES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={['avatar-editor-frame-btn', activeFrameId === f.id ? 'avatar-editor-frame-btn--active' : ''].join(' ')}
                onClick={() => void applyFrame(f.id)}
                title={frameLabel(f.id, tr)}
              >
                <img src={f.src} alt={frameLabel(f.id, tr)} className="avatar-editor-frame-btn__img" />
              </button>
            ))}
            {AVATAR_EDITOR_STICKERS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={['avatar-editor-sticker-btn', tool === 'sticker' && stickerId === s.id ? 'avatar-editor-sticker-btn--active' : ''].join(' ')}
                onClick={() => {
                  setTool('sticker');
                  setStickerId(s.id);
                }}
                title={stickerLabel(s.id, tr)}
              >
                {s.glyph}
              </button>
            ))}
          </AvatarEditorChipRail>
        </div>

        {error && <p className="avatar-editor-error avatar-editor-modal-body__error">{error}</p>}
        </div>

        {inPageCameraOpen && (
          <div className="avatar-editor-inpage-camera" role="region" aria-label={tr('nameAvatar.selfie')}>
            <video ref={cameraVideoRef} className="avatar-editor-inpage-camera__video" playsInline muted autoPlay />
            <div className="avatar-editor-inpage-camera__actions">
              <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--ghost avatar-editor-modal-btn--compact" onClick={stopInPageCamera}>
                {tr('common.cancel')}
              </button>
              <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--primary avatar-editor-modal-btn--compact" disabled={selfieBusy} onClick={() => void handleInPageCameraCapture()}>
                {selfieBusy ? '…' : tr('nameAvatar.shoot')}
              </button>
            </div>
          </div>
        )}

        <div className="avatar-editor-modal-footer">
          <input
            ref={selfieInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="avatar-editor-file-input"
            onChange={handleFileChange}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="avatar-editor-file-input"
            onChange={handleFileChange}
          />
          <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--primary avatar-editor-modal-btn--compact" disabled={selfieBusy || saving || inPageCameraOpen} onClick={() => void handleSelfie()}>
            {selfieBusy ? tr('nameAvatar.cameraBusy') : inPageCameraOpen ? tr('avatarEditor.shooting') : tr('nameAvatar.selfie')}
          </button>
          <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--secondary avatar-editor-modal-btn--compact" disabled={saving || inPageCameraOpen} onClick={() => openGalleryPicker(galleryInputRef.current)}>
            {tr('nameAvatar.gallery')}
          </button>
          {photoDataUrl ? (
            <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--ghost avatar-editor-modal-btn--compact" onClick={handleRemovePhoto}>
              {tr('avatarEditor.noPhoto')}
            </button>
          ) : null}
          <span className="avatar-editor-modal-footer__spacer" aria-hidden />
          <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--ghost avatar-editor-modal-btn--compact" onClick={onCancel} disabled={saving}>
            {tr('common.cancel')}
          </button>
          <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--primary avatar-editor-modal-btn--compact" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '…' : tr('common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
