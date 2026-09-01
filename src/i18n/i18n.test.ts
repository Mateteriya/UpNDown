import { describe, expect, it } from 'vitest';
import { en } from './en';
import { flattenKeys, interpolate } from './path';
import { ru } from './ru';
import { t, translate } from './t';
import type { MessageTree } from './path';

describe('i18n', () => {
  it('keeps the same keys in ru and en', () => {
    const ruKeys = flattenKeys(ru as unknown as MessageTree).sort();
    const enKeys = flattenKeys(en as unknown as MessageTree).sort();
    expect(enKeys).toEqual(ruKeys);
  });

  it('interpolates placeholders', () => {
    expect(interpolate('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
    expect(translate('en', 'lobby.playersCount', { n: 2, max: 4 })).toBe('Players: 2 of 4');
  });

  it('defaults to Russian copy', () => {
    expect(translate('ru', 'menu.tagline')).toBe('Карточная игра на взятки');
    expect(t('common.cancel')).toBeTruthy();
  });
});
