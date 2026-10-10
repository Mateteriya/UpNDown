import { describe, expect, it } from 'vitest';
import { buildAppJoinDeepLink, parseJoinDeepLink } from './deepLinkJoin';

describe('parseJoinDeepLink', () => {
  it('parses play query', () => {
    const j = parseJoinDeepLink('http://192.168.1.5:3001/play/?code=AB12CD&autojoin=1');
    expect(j.code).toBe('AB12CD');
    expect(j.autojoin).toBe(true);
  });

  it('parses updown scheme', () => {
    const j = parseJoinDeepLink('updown://join?code=ZZ99YY&autojoin=1');
    expect(j.code).toBe('ZZ99YY');
    expect(j.autojoin).toBe(true);
  });

  it('parses hash join', () => {
    const j = parseJoinDeepLink('http://x/#join?code=HELLO1&autojoin=1');
    expect(j.code).toBe('HELLO1');
  });
});

describe('buildAppJoinDeepLink', () => {
  it('builds scheme url', () => {
    expect(buildAppJoinDeepLink('ab12cd')).toBe('updown://join?code=AB12CD&autojoin=1');
  });
});
