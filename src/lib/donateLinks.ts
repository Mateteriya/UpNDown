/**
 * Ссылки на донаты: CloudTips и ЮMoney.
 * Задаются в Vercel / `.env.local` (см. .env.example).
 */

export type DonateMethodId = 'cloudtips' | 'yoomoney';

export type DonateLink = {
  id: DonateMethodId;
  label: string;
  hint: string;
  blurb: string;
  url: string | null;
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

/** Два способа поддержки; url=null пока не настроен. */
export function getDonateLinks(): DonateLink[] {
  return [
    {
      id: 'cloudtips',
      label: 'CloudTips',
      hint: 'карта · СБП · Т‑Pay',
      blurb: 'Карта, СБП или Т‑Pay — без регистрации, перевод за пару кликов.',
      url: envUrl('VITE_DONATE_CLOUDTIPS') || null,
    },
    {
      id: 'yoomoney',
      label: 'ЮMoney',
      hint: 'кошелёк или карта',
      blurb: 'С кошелька ЮMoney или с карты — привычный перевод за минуту.',
      url: envUrl('VITE_DONATE_YOOMONEY') || null,
    },
  ];
}

export function hasDonateLinks(): boolean {
  return getDonateLinks().some((l) => !!l.url);
}
