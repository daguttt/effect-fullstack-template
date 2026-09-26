# Working in a Linked Git Worktree

The linked worktree setup provisions isolated Convex and WorkOS development environments for this checkout. The Convex deployment expires five days after it is created, and the WorkOS environment is a disposable unclaimed environment scoped to this worktree.

## Verification

You are allowed and encouraged to verify changes end-to-end with computer use or Chrome in addition to automated tests. The environment is isolated, so you may sign in, navigate through the application, create test data, and exercise the workflows needed to validate your changes.

Start the application in a persistent terminal session with streamed logs:

```bash
pnpm dev:agent
```

Leave the command running while you verify the application. The streamed output keeps frontend, backend, and dependency logs readable without interacting with the Turborepo TUI. Stop the session with `Ctrl-C` after verification.

For backend-only work, use `pnpm dev:backend:agent`. Both commands start the Confect codegen watcher alongside the Convex development server.

The setup summary prints the frontend URL. You can also find its port in the root `.env.local` file as `VITE_DEV_SERVER_PORT`; open `http://localhost:<VITE_DEV_SERVER_PORT>/` for browser or computer-use verification.

### Sign-out lands through the app homepage URL

Neither the WorkOS CLI nor its API can provision a Sign-out URI in an unclaimed environment, so WorkOS still rejects the `return_to` the application asks for. What it does accept from an API key is the app homepage URL, and that is where it sends the browser whenever `return_to` is absent or not a permitted Sign-out URI. `pnpm setup:worktree` therefore sets the homepage to `http://localhost:<port>/signout-callback`, so the fallback lands on the application's sign-out callback screen, which sends the browser to the landing page once AuthKit reports no user.

This homepage points at a callback route only because the environment is disposable. Staging and production register their own Sign-out URIs and must keep their real homepage URLs.

The landing page is a convenience. Sign-out is still verified by its durable signals:

- the browser reaches `api.workos.com/user_management/sessions/logout`, not the application's callback directly;
- `GET /user_management/users/<id>/sessions` no longer lists the session as active;
- the AuthKit root stays on the authentication page instead of silently returning a code to `/callback`; and
- `workos:refresh-token:<clientId>` is gone from `localStorage` — read it from a static path such as `/favicon.ico`, since loading an application route restarts the AuthKit client.

## Development accounts

`developmentSeeder:seed` creates these accounts in the worktree's WorkOS environment and syncs them into Convex:

| Access | Email               | Password              |
| ------ | ------------------- | --------------------- |
| Agent  | `agent@example.org` | `dev-account-agent&1` |
| Human  | `human@example.org` | `dev-account-human&1` |

Sign in with email and password on the AuthKit page. Add accounts in `packages/backend/src/confect/modules/developmentSeeder/domain/accounts.ts` once the app has roles; keep them idempotent, because setup reseeds on every run.

## Environment lifecycle

`pnpm setup:worktree` installs dependencies, provisions and selects the isolated Convex deployment, provisions an unclaimed WorkOS environment, configures its login callback, CORS origin, and app homepage URL, creates or recovers its webhook endpoint, runs Confect codegen, pushes the generated backend, and runs `developmentSeeder:seed`. It is implemented in `packages/scripts/src/worktree/setup.ts`.

Environment values and credentials are written to the ignored root `.env.local` file (mode `0600`) and to the selected Convex deployment. There is no manifest file: everything the teardown needs is `WORKOS_LOCAL_ENV_NAME` in `.env.local`, and the rest is derived from the git dir. Do not copy credentials into tracked files or reuse them outside this worktree.

The WorkOS API key exists only in the response that created it — it cannot be re-read or rotated. Setup persists it to `.env.local` immediately, so a failed run can be re-run and will resume from those credentials instead of provisioning a second environment.

Before removing the linked worktree, stop any running development command (`pnpm dev:agent` or `pnpm dev:backend:agent`) and run:

```bash
pnpm teardown:worktree --yes
```

Use `pnpm teardown:worktree --dry-run` first when you need to inspect the exact plan. Teardown forgets the worktree's WorkOS environment from the local CLI registry and deletes `.env.local`. Nothing remote is destroyed: the WorkOS environment stays unclaimed and is abandoned, and the Convex deployment is reclaimed by its five-day expiration. Running teardown twice succeeds both times.

The two halves outlive each other unevenly. The Convex deployment reference is derived from the git dir, so `deployment select` finds the same populated deployment on every run, while the WorkOS credentials live only in `.env.local` and are gone the moment teardown deletes it. Re-running setup after a teardown therefore pairs the surviving deployment with a _fresh_ WorkOS environment, and every local `externalId` points at a retired one. The seeder reconciles that drift rather than failing on it: `users.upsertFromWorkOS` matches the development accounts by email and repoints them at whatever the current environment holds.

If the worktree was already removed, its WorkOS environment name is gone with its `.env.local` and cannot be resolved. Run `pnpm teardown:worktree gc` to review local WorkOS CLI profiles alongside the worktrees that still exist, then run `pnpm teardown:worktree gc --prune` to forget every profile no readable live worktree claims. Setup and GC share the registry lock, and setup persists a fresh claim before releasing it, so pruning is safe while another worktree is being provisioned.

The WorkOS CLI registry is machine-wide, so `gc --prune` also treats profiles provisioned by other repositories on this machine as unclaimed. Review the `gc` report before pruning when another project uses the same worktree tooling.
