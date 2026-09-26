# Effect Full-Stack Template

A pnpm + Turborepo monorepo for shipping a typed full-stack app quickly, laid out so several coding agents can work in parallel git worktrees without stepping on each other.

| Layer    | Stack                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------- |
| Backend  | Convex 1.46, Confect 10 (next), Effect 4 (rc), `@convex-dev/workflow`, `@convex-dev/workos-authkit` |
| Frontend | Vite 8, React 19 + React Compiler, TanStack Router + Form, `@confect/react`, `@effect/atom-react` |
| Auth     | WorkOS AuthKit (hosted sign-in, webhook-synced users)                                          |
| UI       | Tailwind CSS 4, shadcn (`base-vega` style on Base UI), Sonner, lucide                          |
| Tooling  | TypeScript 6 + `tsgo` 7, oxlint (type-aware, `@effect/tsgo` preset), Prettier, Vitest 5         |

Versions are pinned in `pnpm-workspace.yaml` catalogs.

## What is already built

- **Full-stack type safety**: Confect specs in `packages/backend/src/confect/*.spec.ts` generate `@repo/backend/refs`. The frontend calls `useQuery(refs.public.users.me, {})` and gets decoded returns and typed errors, with no hand-written client types.
- **Authentication**: `/signin`, `/signup`, `/callback`, `/signout`, and `/signout-callback` are wired to WorkOS AuthKit, plus an `_authenticated` layout route with `returnTo` handling. The WorkOS webhook upserts users into Convex, and the `RequireUserIdentity` middleware guards Confect functions.
- **Durable execution**: the `workflows` module wraps `@convex-dev/workflow` so steps keep Confect's codecs and typed errors, and `classifyWorkflowError` recovers typed failures. `exampleWorkflows` shows the end-to-end pattern (mutation, workflow, `onComplete`, reactive status on `/app`) and is meant to be deleted.
- **Parallel-agent worktrees**: `pnpm setup:worktree` gives each linked worktree its own Convex deployment, WorkOS environment, dev-server port, and seeded dev accounts.
- **Agent context**: `AGENTS.md`, coding standards in `docs/agents/`, ADRs in `docs/adr/`, a `CONTEXT.md` glossary, and skills in `.agents/skills` and `.claude/skills`.
- **CI**: format, lint, typecheck, and tests on every PR, plus opt-in isolated PR previews on Convex + WorkOS + Vercel (`docs/pr-previews.md`).

## Start a project

Prerequisites: Node 24 (`.nvmrc`), pnpm 12, a Convex account (`pnpm dlx convex login`), and the [WorkOS CLI](https://github.com/workos/cli) (`workos` on your `PATH`).

```bash
gh repo create my-app --template daguttt/effect-fullstack-template --private --clone
cd my-app
pnpm bootstrap:main -- --team <convex-team-slug> --project my-app
```

`bootstrap:main` creates the Convex project that every worktree derives its deployment from, and pushes the backend once. Then develop in a linked worktree, as a human or an agent:

```bash
git worktree add ../my-app-feature -b feature
cd ../my-app-feature
pnpm setup:worktree     # Convex deployment + WorkOS env + seed; prints the app URL
pnpm dev                # or `pnpm dev:agent` for streamed logs
```

Sign in as `agent@example.com` / `dev-account-agent&1` or `human@example.com` / `dev-account-human&1`. Before removing a worktree, run `pnpm teardown:worktree --yes`. The full lifecycle is in [`docs/agents/linked-git-worktree.md`](docs/agents/linked-git-worktree.md).

Then make it yours:

- Rename the app in `apps/frontend/src/modules/common-ui/app-name.constant.ts` and `apps/frontend/index.html`.
- Describe the domain in `CONTEXT.md`.
- Replace `exampleWorkflows` (backend group, module and table, plus `apps/frontend/src/routes/_authenticated/app/-feat`) with real features.

## Layout

```text
apps/frontend/            Vite + TanStack Router SPA (routes in src/routes, shared code in src/modules)
packages/backend/         Convex functions authored with Confect
  src/confect/*.spec.ts   function contracts (args, returns, typed errors, middleware)
  src/confect/*.impl.ts   Effect implementations
  src/confect/modules/    domain / application / infrastructure / presentation layers
  src/confect/tables/     table registrations and indexes
packages/ui/              shadcn components on Base UI, Tailwind theme (`pnpm dev:ui` playground)
packages/scripts/         worktree setup/teardown, PR preview lifecycle, Vercel env sync
docs/                     agent standards, ADRs, PR preview guide
```

## Everyday commands

| Command                                 | What it does                                                   |
| --------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:agent`           | Frontend, Convex dev server, and Confect codegen watcher       |
| `pnpm feedback`                         | Format check, type-aware lint, typecheck                       |
| `pnpm test:run:all`                     | Every Vitest suite (backend tests run on `convex-test`)        |
| `pnpm confect:codegen`                  | Regenerate Confect refs after editing specs or tables          |
| `pnpm format:write:all` / `pnpm lint:fix` | Autofix                                                      |
