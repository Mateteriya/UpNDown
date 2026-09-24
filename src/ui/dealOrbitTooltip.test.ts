import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n/locale';
import { getOrbitPointTooltipText } from './DealTrackLabPage';

describe('orbit tooltip calendar', () => {
  afterEach(() => {
    setLocale('ru');
  });

  it('3-player deal 26 is no-trump with 12 cards, not 4p dark', () => {
    setLocale('ru');
    expect(getOrbitPointTooltipText(26, 3)).toMatch(/бескозырка/i);
    expect(getOrbitPointTooltipText(26, 3)).toMatch(/КАРТ: 12/);
    expect(getOrbitPointTooltipText(26, 4)).toMatch(/тёмная/i);
  });

  it('3-player deals 12–14 are 12 cards each', () => {
    setLocale('ru');
    expect(getOrbitPointTooltipText(12, 3)).toMatch(/КАРТ: 12 каждому/);
    expect(getOrbitPointTooltipText(13, 3)).toMatch(/КАРТ: 12 каждому/);
    expect(getOrbitPointTooltipText(14, 3)).toMatch(/КАРТ: 12 каждому/);
  });

  it('3-player dark starts at 29', () => {
    setLocale('ru');
    expect(getOrbitPointTooltipText(29, 3)).toMatch(/тёмная/i);
    expect(getOrbitPointTooltipText(31, 3)).toMatch(/тёмная/i);
    expect(getOrbitPointTooltipText(31, 3)).toMatch(/КАРТ: 12/);
  });

  it('English copy for 3-player orbit tips', () => {
    setLocale('en');
    expect(getOrbitPointTooltipText(26, 3)).toMatch(/no trump/i);
    expect(getOrbitPointTooltipText(26, 3)).toMatch(/CARDS: 12/);
    expect(getOrbitPointTooltipText(12, 3)).toMatch(/CARDS: 12 each/);
    expect(getOrbitPointTooltipText(29, 3)).toMatch(/blind/i);
    expect(getOrbitPointTooltipText(26, 4)).toMatch(/blind/i);
  });
});
