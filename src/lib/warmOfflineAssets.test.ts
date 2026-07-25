import { describe, expect, it } from 'vitest';
import { getOfflinePackManifest } from './warmOfflineAssets';

describe('offline pack manifest', () => {
  it('includes shell icons, face cards, AI avatars, and menu casts/legends', () => {
    const m = getOfflinePackManifest();
    const shell = m.filter((x) => x.bucket === 'shell');
    const cards = m.filter((x) => x.bucket === 'cards');
    const ai = m.filter((x) => x.bucket === 'aiAvatars');
    const menu = m.filter((x) => x.bucket === 'menu');
    expect(shell).toHaveLength(4);
    expect(cards).toHaveLength(16);
    expect(ai).toHaveLength(18);
    expect(menu).toHaveLength(9);
    expect(m).toHaveLength(47);
  });
});
