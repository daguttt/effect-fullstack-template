import { describe, expect, it } from 'vitest';

import { checkSafeReturnTo } from './post-login.utils';

describe('checkSafeReturnTo', () => {
  it('allows same-origin paths and rejects protocol-relative URLs', () => {
    expect(checkSafeReturnTo('/dashboard')).toBe(true);
    expect(checkSafeReturnTo('/app?tab=runs')).toBe(true);
    expect(checkSafeReturnTo('//evil.example')).toBe(false);
  });

  it('rejects auth-entry destinations to avoid recursive returnTo values', () => {
    expect(checkSafeReturnTo('/signin')).toBe(false);
    expect(checkSafeReturnTo('/signup')).toBe(false);
    expect(checkSafeReturnTo('/callback')).toBe(false);
    expect(checkSafeReturnTo('/signout')).toBe(false);
    expect(checkSafeReturnTo('/signout-callback')).toBe(false);
    expect(checkSafeReturnTo('/signin?returnTo=%2Fdashboard')).toBe(false);
    expect(
      checkSafeReturnTo(
        '/signin?returnTo=%2Fsignin%3FreturnTo%3D%252Fdashboard'
      )
    ).toBe(false);
  });
});
