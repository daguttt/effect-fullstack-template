// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import * as Authentication from '#modules/authentication';

import { resolveCallbackReturnTo } from './callback-return-to.utils';

describe('resolveCallbackReturnTo', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('prefers the WorkOS state over the copy stored by the sign-in tab', () => {
    Authentication.setPostLoginReturnTo('/l/main/dashboard');

    expect(
      resolveCallbackReturnTo({ stateReturnTo: '/l/main/customers/abc' })
    ).toBe('/l/main/customers/abc');
  });

  it('lands on the state target when sign-in finishes in a tab without stored state', () => {
    expect(
      resolveCallbackReturnTo({ stateReturnTo: '/l/main/customers/abc' })
    ).toBe('/l/main/customers/abc');
  });

  it('falls back to the stored copy when the state is missing or unsafe', () => {
    Authentication.setPostLoginReturnTo('/l/main/customers/abc');
    expect(resolveCallbackReturnTo({ stateReturnTo: undefined })).toBe(
      '/l/main/customers/abc'
    );

    Authentication.setPostLoginReturnTo('/l/main/customers/abc');
    expect(resolveCallbackReturnTo({ stateReturnTo: '//evil.example' })).toBe(
      '/l/main/customers/abc'
    );

    Authentication.setPostLoginReturnTo('/l/main/customers/abc');
    expect(resolveCallbackReturnTo({ stateReturnTo: '/signin' })).toBe(
      '/l/main/customers/abc'
    );
  });

  it('falls back to the app root when nothing safe is available', () => {
    Authentication.setPostLoginReturnTo('/callback');

    expect(
      resolveCallbackReturnTo({ stateReturnTo: 'https://evil.example' })
    ).toBe(Authentication.REDIRECT_AUTH_FALLBACK_PATH);
  });

  it('clears the stored copy even when the state wins', () => {
    Authentication.setPostLoginReturnTo('/l/main/dashboard');
    resolveCallbackReturnTo({ stateReturnTo: '/l/main/customers/abc' });

    expect(resolveCallbackReturnTo({ stateReturnTo: undefined })).toBe(
      Authentication.REDIRECT_AUTH_FALLBACK_PATH
    );
  });
});
