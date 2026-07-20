/**
 * Ссылки на донаты: задаются в Vercel / `.env.local`.
 * Пока пусто — страница всё равно открывается с текстом «скоро».
 */

export type DonateLink = {
  id: string;
  label: string;
  hint: string;
  url: string;
};

function envUrl(key: string): string {
  try {
    const raw = (import.meta.env[key] as string | undefined)?.trim() ?? '';
    if (!raw) return '';
    if (!/^https?:\/\//i.test(raw)) return '';
    return raw;
  } catch {
    return '';
  }
}

/** Настроенные ссылки (порядок: основная → Boosty → CloudTips → прочее). */
export function getDonateLinks(): DonateLink[] {
  const out: DonateLink[] = [];
  const primary = envUrl('VITE_DONATE_URL');
  if (primary) {
    out.push({
      id: 'primary',
      label: 'Поддержать',
      hint: 'основная ссылка',
      url: primary,
    });
  }
  const boosty = envUrl('VITE_DONATE_BOOSTY');
  if (boosty) {
    out.push({
      id: 'boosty',
      label: 'Boosty',
      hint: 'подписка или разово',
      url: boosty,
    });
  }
  const tips = envUrl('VITE_DONATE_CLOUDTIPS');
  if (tips) {
    out.push({
      id: 'cloudtips',
      label: 'CloudTips',
      hint: 'быстрый перевод',
      url: tips,
    });
  }
  const extra = envUrl('VITE_DONATE_EXTRA_URL');
  const extraLabel = (import.meta.env.VITE_DONATE_EXTRA_LABEL as string | undefined)?.trim() || 'Ещё способ';
  if (extra) {
    out.push({
      id: 'extra',
      label: extraLabel.slice(0, 40),
      hint: 'дополнительно',
      url: extra,
    });
  }
  return out;
}

export function hasDonateLinks(): boolean {
  return getDonateLinks().length > 0;
}
