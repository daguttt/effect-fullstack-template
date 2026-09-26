/**
 * Accounts seeded into every development deployment. The WorkOS environment
 * behind a linked worktree is disposable, so these credentials never reach a
 * real user base. Add an account per role once the app has roles.
 */
export const DEVELOPMENT_ACCOUNTS = [
  {
    email: 'agent@example.com',
    externalId: 'development-agent',
    password: 'dev-account-agent&1',
    firstName: 'Agent',
    lastName: 'Developer',
  },
  {
    email: 'human@example.com',
    externalId: 'development-human',
    password: 'dev-account-human&1',
    firstName: 'Human',
    lastName: 'Developer',
  },
] as const;

export type DevelopmentAccount = (typeof DEVELOPMENT_ACCOUNTS)[number];
