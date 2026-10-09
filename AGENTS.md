# Project

A full-stack TypeScript monorepo: Convex + Confect + Effect v4 on the backend (`packages/backend`), Vite + React 19 + TanStack Router on the frontend (`apps/frontend`), WorkOS AuthKit for identity, shared shadcn/Base UI components (`packages/ui`), and worktree tooling (`packages/scripts`). Types flow from the backend's Confect specs to the frontend without hand-written copies.

The app has no users yet. Schema changes need no migrations; hard data resets are fine.

## Rules

### General

- Use conventional commits for commit messages.
- Use `pnpm` for every package operation.
- After changing source code, run `pnpm feedback` (format check, lint, typecheck) and `pnpm test:run:all`, then fix what they report.
- Use the `opensrc` skill to read a library's source when its behaviour matters.

### Effect code

- Before writing Effect code, run `pnpm dlx opensrc path effect --cwd packages/backend` and read `LLMS.md` two directories up from the printed path (`../../LLMS.md`) for idiomatic usage, tests, module structure, and API design.

## Working in linked git worktrees

Run this to learn whether you are in the main checkout or a linked worktree:

```bash
main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')" && current="$(git rev-parse --show-toplevel)" && { [ "$current" = "$main" ] && echo "In main worktree" || echo "In the linked worktree: $current"; }
```

- **Linked worktree**: read [`docs/agents/linked-git-worktree.md`](./docs/agents/linked-git-worktree.md) before starting development or verification.
- **Main checkout**: it only anchors the Convex project. Develop in a linked worktree (`git worktree add ../<name> -b <branch>`, then `pnpm setup:worktree` inside it).

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain documentation layout. See `docs/agents/domain.md`.

## Coding standards

### Shared

- Comments are concise, describe how a thing is used (mostly on functions), and move when the code moves.
- Keep the `Dto` suffix for payloads that name a write, with the verb in front (`UpdateUserDto`, `StartExampleWorkflowDto`); read and response shapes use projection nouns instead (`UserDetail`, `RunSummary`). Keep the `Schema` suffix for values something consumes as a schema, such as `UsersTableSchema` or `StartExampleWorkflowFormStandardSchema`.
- Resolve state immutably: a ternary for simple cases, a value- or Effect-returning IIFE instead of `let` for multi-statement branches.
- Keep logic inline in the function that uses it. A helper earns extraction when it has a **third** caller or when it turns an `else` branch into an early-return guard.
- Tests assert observable behaviour through the subject's public interface. A tautological test, one that restates the subject's own source or configuration and passes whenever the file exists, proves nothing and is deleted.

### Backend

Before writing code under `packages/backend`, read [`docs/agents/backend-standards.md`](docs/agents/backend-standards.md).

### Frontend

Before writing code under `apps/frontend`, read [`docs/agents/frontend-standards.md`](docs/agents/frontend-standards.md).

If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Gotchas

- **Durable work**: long-running or multi-step backend work uses `@convex-dev/workflow` through the `workflows` module. Copy the shape of `exampleWorkflows` (backend group, module, table, and the `/app` panel); [ADR 0005](docs/adr/0005-run-durable-work-as-confect-workflows-terminalized-on-complete.md) explains it. Delete the example once a real feature replaces it.
- **Generated code is committed**: `packages/backend/src/confect/_generated`, `packages/backend/src/convex/_generated`, the one-line re-exports in `packages/backend/src/convex/*.ts`, and `apps/frontend/src/routeTree.gen.ts`. `pnpm dev` keeps them current. After changing a `*.spec.ts` or a table without the dev server, run `pnpm confect:codegen`.
- **Auth routes**: `/signin`, `/signup`, `/callback`, `/signout`, and `/signout-callback` are fixed; WorkOS is configured with the last two by `pnpm setup:worktree` and the PR-preview workflow. Pages that require a session go under `src/routes/_authenticated/`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`packages/backend/src/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
