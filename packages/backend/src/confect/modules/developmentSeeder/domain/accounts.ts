/**
 * Accounts seeded into every development deployment. The WorkOS environment
 * behind a linked worktree is disposable, so these credentials never reach a
 * real user base. Add an account per role once the app has roles.
 *
 * Use `example.org`: every unclaimed WorkOS environment ships a "Test
 * Organization" whose SSO connection claims `example.com`, which would route
 * these accounts to its test identity provider instead of password sign-in.
 */
export const DEVELOPMENT_ACCOUNTS = [
  {
    email: 'agent@example.org',
    externalId: 'development-agent',
    password: 'dev-account-agent&1',
    firstName: 'Agent',
    lastName: 'Developer',
  },
  {
    email: 'human@example.org',
    externalId: 'development-human',
    password: 'dev-account-human&1',
    firstName: 'Human',
    lastName: 'Developer',
  },
] as const;

export type DevelopmentAccount = (typeof DEVELOPMENT_ACCOUNTS)[number];
