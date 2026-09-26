import type { AuthConfig } from 'convex/server';

import { env } from '../convex/_generated/server';

const clientId = env.WORKOS_CLIENT_ID;

export default {
  providers: [
    // Only the AuthKit issuer is accepted. Listing a second issuer for the same
    // WorkOS client makes `identity.tokenIdentifier` (`iss` + `sub`) unstable for
    // a single person, and every auth-linked lookup keys off it — see
    // `modules/workos/infrastructure/userMapping.ts`, which synthesizes this exact
    // issuer. A legacy `https://api.workos.com` token also carries an SSO-shaped
    // `sub` that is not a WorkOS user id, so it cannot be served downstream anyway.
    {
      type: 'customJwt',
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: 'RS256',
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
} satisfies AuthConfig;
