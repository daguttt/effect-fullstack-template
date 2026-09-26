# Isolated PR previews

Add the `preview` label to a same-repository PR to provision its environment.
The **Isolated PR preview** workflow runs on labeling, subsequent pushes, and
reopening. A single bot comment on the PR shows the preview URL, Convex expiry,
and how to renew it. Later runs update that comment; failed provisioning or
deployment shows the failed step and links to its workflow logs. Daily renewal
also updates the comment's expiry. To renew immediately or retry, push a commit
or remove and re-add `preview` on the open PR. Its deployment link and run
summary also open the frontend. Use the
[development accounts](agents/linked-git-worktree.md#development-accounts) to
sign in. Only repository writers can trigger a build; fork PRs are excluded.

The workflow selects `team:project:pr/<number>`, an isolated Convex cloud dev
deployment. It saves the unclaimed WorkOS environment credentials together in
the deployment's `PR_PREVIEW_WORKOS` environment variable immediately after
provisioning. Subsequent runs recover that environment, reconcile its webhook,
deploy the backend, and run `developmentSeeder:seed`, using the same adapters
as `setup:worktree`.

Every run renews Convex's expiration to five days from setup. The **Renew open PR
previews** workflow also renews existing deployments daily, so idle PRs keep
their data. It reads open, labeled, same-repository PRs without checking out or
running their code. The deployment workflow calls the same renewal job after
each successful build; it can also be run manually.

Removing the label or closing the PR stops renewal. Convex then expires the
backend and its data within five days. If renewal fails for five consecutive
days, a later labeled push recreates and seeds the expired environment. No
close workflow or permanent deployments are needed. The daily schedule starts
once these workflows are merged into the default branch.

WorkOS has the same lifecycle limitation as local worktrees: its environment is
unclaimed and disposable, but the CLI cannot delete it remotely and WorkOS does
not publish a retention guarantee. An expired Convex deployment also loses the
saved WorkOS credentials. Vercel deployments follow the project's normal
retention settings; their frontend can outlive the expired backend.

## Initial configuration

Repository Actions secrets:

| Name | Value |
| --- | --- |
| `PR_PREVIEW_CONVEX_ACCESS_TOKEN` | The `accessToken` from the local `~/.convex/config.json`. This authenticates the existing worktree CLI operations. |
| `PR_PREVIEW_VERCEL_TOKEN` | A Vercel access token authorized to deploy to the configured project. Create a durable token, rather than copying the expiring CLI OAuth login. |

Repository Actions variables:

| Name | Value |
| --- | --- |
| `PR_PREVIEW_CONVEX_PROJECT` | `<team_slug>:<project_slug>` (the project `pnpm bootstrap:main` created) |
| `PR_PREVIEW_VERCEL_ORG_ID` | The Vercel team id (`team_...`) |
| `PR_PREVIEW_VERCEL_PROJECT_ID` | The Vercel project id (`prj_...`) |

The label is `preview`. Do not apply it to code you would not run with these
credentials. The job executes the PR's exact head commit with secret access,
so the same-repository check does not replace code review. The Convex personal
token has the same project access as the local login; it is not a single
deployment key. A project key is an alternative for a future narrower setup.

## Deployment order and recovery

The Actions job builds Vite itself and uploads `.vercel/output` with
`vercel deploy --prebuilt`. This bypasses the existing Vercel build command,
so that command cannot deploy a second Convex backend or seed a shared one.
The workflow does not change the project's separate Git integration.

Vercel returns the actual generated URL. The final setup command registers
`<url>/callback`, the CORS origin, and `<url>/signout-callback` as WorkOS's app
homepage. This reuses the worktree logout fallback. `VITE_PR_PREVIEW=true`
turns on AuthKit's dev mode, because a generated Vercel host cannot share
WorkOS's session cookies. It does not change Vite's production build mode.

Runs for the same PR are serialized and are not canceled mid-provisioning.
Rerun a failed workflow to recover saved credentials and complete setup. A
malformed saved credential record fails without provisioning a replacement.
A process failure between WorkOS returning its one-time API key and Convex
accepting the first persistence write can still abandon an unclaimed
environment, just as a failed local credential write can in worktree setup.

Public preview metadata goes into the job summary and GitHub deployment link.
WorkOS keys and webhook secrets stay on Convex; they are not workflow outputs,
artifacts, caches, or frontend build variables. The root `.env.local` generated
in the runner contains only the selected Convex reference and public frontend
configuration. The command refuses to overwrite an existing `.env.local`.

