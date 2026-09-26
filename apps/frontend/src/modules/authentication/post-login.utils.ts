const POST_LOGIN_RETURN_TO_KEY = 'postLoginReturnTo';

export function setPostLoginReturnTo(returnTo: string) {
  sessionStorage.setItem(POST_LOGIN_RETURN_TO_KEY, returnTo);
}

export function consumePostLoginReturnTo(): string | null {
  const returnTo = getPostLoginReturnTo();
  sessionStorage.removeItem(POST_LOGIN_RETURN_TO_KEY);
  return returnTo;
}

export function checkSafeReturnTo(returnTo: string | null): boolean {
  if (
    typeof returnTo !== 'string' ||
    !returnTo.startsWith('/') ||
    returnTo.startsWith('//')
  )
    return false;

  const pathname = getReturnToPathname(returnTo);
  if (pathname === null) return false;

  return !checkIsAuthRoutePathname(pathname);
}

function getPostLoginReturnTo(): string | null {
  return sessionStorage.getItem(POST_LOGIN_RETURN_TO_KEY);
}

function getReturnToPathname(returnTo: string): string | null {
  try {
    return new URL(returnTo, 'http://app.local').pathname;
  } catch {
    return null;
  }
}

function checkIsAuthRoutePathname(pathname: string): boolean {
  return /^\/(?:signin|signup|callback|signout(?:-callback)?)\/?$/.test(
    pathname
  );
}
