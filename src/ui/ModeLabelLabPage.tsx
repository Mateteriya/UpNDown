/**
 * Лаборатория: варианты ПК-надписей «Онлайн / Офлайн» на split-капсулах
 * + песочница статусов аватарки главной.
 * URL: /mode-label-lab — только локальные тесты, не прод-меню.
 */

import { useState, type ReactNode } from 'react';
import { accountRouteHref } from '../lib/accountRoute';
import { MenuPlaySplitCapsule } from './MenuEntryActions';
import { AvatarStatusLabSection } from './mode-label-lab/AvatarStatusLab';
import { GuestSwissLabSection } from './mode-label-lab/GuestSwissLab';
import { HandLayoutLabSection } from './mode-label-lab/HandLayoutLab';
import {
  ModeLabelCenterWatermarkCaption,
  ModeLabelCenterWatermarkGhost,
  ModeLabelHoloOrbitHybridRings,
  ModeLabelHoloWedge,
  ModeLabelOrbitalRing,
} from './mode-label-lab/ModeLabelLabVariants';
import { SupportButtonLabSection } from './mode-label-lab/SupportButtonLab';
import { OfflineOrbLabSection } from './mode-label-lab/OfflineOrbLab';
import '../styles/mode-label-lab.css';
import '../styles/avatar-status-lab.css';
import '../styles/guest-swiss-lab.css';
import '../styles/hand-layout-lab.css';
import '../styles/support-button-lab.css';
import '../styles/offline-orb-lab.css';

type LabelVariant = 'current' | 'hybrid' | 'holo' | 'orbit' | 'watermark';
/** Полный = как на 16″+; компакт ≈ −22% под планшет / узкий ПК. */
type LabDensity = 'full' | 'compact';

interface ModeLabelLabPageProps {
  onBack: () => void;
}

function labSlots(mode: 'online' | 'offline', variant: LabelVariant): {
  modeLabelSlot?: ReactNode | false;
  shellDecor?: ReactNode;
} {
  if (variant === 'current') return {};
  if (variant === 'hybrid') {
    return {
      modeLabelSlot: <ModeLabelHoloOrbitHybridRings mode={mode} />,
      /* клин у нижнего края shell — не в cluster глифа */
      shellDecor: <ModeLabelHoloWedge mode={mode} />,
    };
  }
  if (variant === 'holo') {
    /* Офлайн: клин у нижней границы shell; онлайн — под глифом */
    if (mode === 'offline') {
      return {
        modeLabelSlot: false,
        shellDecor: <ModeLabelHoloWedge mode={mode} />,
      };
    }
    return { modeLabelSlot: <ModeLabelHoloWedge mode={mode} /> };
  }
  if (variant === 'orbit') {
    return { modeLabelSlot: <ModeLabelOrbitalRing mode={mode} /> };
  }
  return {
    modeLabelSlot: <ModeLabelCenterWatermarkCaption mode={mode} />,
    shellDecor: <ModeLabelCenterWatermarkGhost mode={mode} />,
  };
}

function LabCapsule({
  mode,
  variant,
  label,
}: {
  mode: 'online' | 'offline';
  variant: LabelVariant;
  label: string;
}) {
  const slots = labSlots(mode, variant);

  return (
    <div className="mode-label-lab__card">
      <p className="mode-label-lab__card-label">{label}</p>
      <div className={`mode-label-lab__slot mode-label-lab__slot--${variant}`}>
        <div className="menu-screen menu-screen--pc-cinematic mode-label-lab__menu-context">
          <section className="menu-screen__section menu-screen__section--glyphs-only">
            <div className={`menu-screen__drift menu-screen__drift--${mode} mode-label-lab__drift`}>
              <MenuPlaySplitCapsule
                mode={mode}
                canResume
                satelliteCode={mode === 'online' ? 'TEST42' : null}
                onMain={() => {}}
                onResume={() => {}}
                pcModeLabels={false}
                modeLabelSlot={slots.modeLabelSlot}
                shellDecor={slots.shellDecor}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LabSection({
  title,
  description,
  variant,
  featured,
}: {
  title: string;
  description: string;
  variant: LabelVariant;
  featured?: boolean;
}) {
  return (
    <section className={`mode-label-lab__section${featured ? ' mode-label-lab__section--featured' : ''}`}>
      <div className="mode-label-lab__section-head">
        {featured ? <span className="mode-label-lab__badge">выбор</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="mode-label-lab__row">
        <LabCapsule mode="online" variant={variant} label="Онлайн · split" />
        <LabCapsule mode="offline" variant={variant} label="Офлайн · split" />
      </div>
    </section>
  );
}

export function ModeLabelLabPage({ onBack }: ModeLabelLabPageProps) {
  const [density, setDensity] = useState<LabDensity>('full');

  return (
    <div
      className={`mode-label-lab mode-label-lab--density-${density}`}
      data-lab-density={density}
    >
      <header className="mode-label-lab__header">
        <button type="button" className="mode-label-lab__back" onClick={onBack}>
          ← В приложение
        </button>
        <div>
          <h1 className="mode-label-lab__title">Лаб: меню, аватарка, рука 10–12</h1>
          <p className="mode-label-lab__hint">
            Локальная песочница (`/mode-label-lab`). Сверху — офлайн-кнопка (DevTools-тюнинг) и
            «Поддержать»; дальше рука 10–12, guest-крест, аватарка и надписи режима. Прод не
            меняется.
          </p>
        </div>
        <div className="mode-label-lab__density" role="group" aria-label="Плотность капсул">
          <span className="mode-label-lab__density-label">Плотность</span>
          <div className="mode-label-lab__density-toggle">
            <button
              type="button"
              className={
                density === 'full'
                  ? 'mode-label-lab__density-btn mode-label-lab__density-btn--active'
                  : 'mode-label-lab__density-btn'
              }
              aria-pressed={density === 'full'}
              onClick={() => setDensity('full')}
            >
              Полный
              <span className="mode-label-lab__density-meta">16″+</span>
            </button>
            <button
              type="button"
              className={
                density === 'compact'
                  ? 'mode-label-lab__density-btn mode-label-lab__density-btn--active'
                  : 'mode-label-lab__density-btn'
              }
              aria-pressed={density === 'compact'}
              onClick={() => setDensity('compact')}
            >
              Компакт
              <span className="mode-label-lab__density-meta">≈ −22%</span>
            </button>
          </div>
        </div>
        <span className="mode-label-lab__dev-tag">local · not prod</span>
      </header>

      <div className="mode-label-lab__body">
        <OfflineOrbLabSection />

        <SupportButtonLabSection />

        <HandLayoutLabSection />

        <GuestSwissLabSection />

        <AvatarStatusLabSection onOpenCabinet={() => (window.location.href = accountRouteHref())} />

        <p className="mode-label-lab__density-note">
          {density === 'full' ? (
            <>
              Ниже — лаб надписей режима. Сейчас: <strong>полный</strong> размер (эталон с 16″).
              Переключи на «Компакт», чтобы проверить планшет / узкий ПК.
            </>
          ) : (
            <>
              Сейчас: <strong>компакт ≈ −22%</strong>. Цель — читаемые «Новая партия» / hint без
              наезда клина; глиф и декор пропорционально мельче.
            </>
          )}
        </p>

        <LabSection
          featured
          variant="hybrid"
          title="Симбиоз 2+3 — клин + орбитальные кольца"
          description="Прод-онлайн. Кольца вокруг глифа; клин у нижнего края shell."
        />
        <LabSection
          variant="current"
          title="Сейчас — компактная дуга (эталон)"
          description="Маленькая SVG-дуга под глифом. На мобилке остаётся."
        />
        <LabSection
          variant="holo"
          title="Вариант 2 — Голографический клин"
          description="Прод-офлайн. Только клин, без орбиты."
        />
        <LabSection
          variant="orbit"
          title="Вариант 3 — Орбитальное кольцо"
          description="Только орбита с текстом по нижней дуге."
        />
        <LabSection
          variant="watermark"
          title="Вариант 4 — Центральный watermark"
          description="Ghost в центре + пилюля под глифом."
        />
      </div>
    </div>
  );
}
