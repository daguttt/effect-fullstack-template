# November 5, 2026 dependency upgrade

## Baseline and scope

The clean bound worktree started at fresh `origin/main`
`9119ec3f17f021ea50fcb814c364429977198b9e`. This is the rollback checkpoint.
The main checkout at `/Users/daguttt/code/sandbox/effect-fullstack-template`
was left alone. GitHub reports `daguttt/effect-fullstack-template` with default
branch `main`.

The reference is merged [Pet Resort Systems PR 1127](https://github.com/Pet-Resort-Systems/pet-resort-systems/pull/1127),
reviewed head `f16ea9e7c33ba91fd77e3d13b77cc392d8010208`, squash
`8252725daf2b887f1b580240d71af80843688e7c`. Its report and reviewed diff were
inspected locally. This repository's manifests, source, and policies determine
what applies; no Pet Resort domain code was copied.

This workspace contains five importers: root, frontend, backend, scripts, and
UI. There are no `legacy-apps`, `legacy-packages`, or `packages/artifacts`
consumers. It has no Next, Astro, Starlight, Table, or Virtual dependency, so
those upgrades, the Starlight js-yaml override, and Virtual test geometry
changes do not apply. Existing js-yaml resolves to 4.3.2 without an override.

## Version selection

Registry publication times, stable tags, engines, peer ranges, deprecations,
upstream changelogs, and relevant versioned source were checked on November 5.
Every selected release is older than the existing one-day release-age default.
No age exception, build permission, skill approval, lint rule, or security
policy was added or relaxed.

| Dependency                                | Before              | After               | Published UTC | Benefit                                                                           |
| ----------------------------------------- | ------------------- | ------------------- | ------------- | --------------------------------------------------------------------------------- |
| Node                                      | 24.21.0             | 24.22.2             | October 28    | V8 and stream fixes; local selection and both CI workflows share `.nvmrc`         |
| Workflow, frontend and backend            | 0.4.8               | 0.4.10              | October 10    | Convex reference types and updated component test registration                    |
| Effect, platform-node, vitest, atom-react | 4.0.3               | 4.1.2               | November 2    | Coordinated runtime, atom subscription and scheduling fixes                       |
| Confect cli, core, react, server, test    | 10.2.0              | 10.5.0              | October 31    | Effect 4.1 compatibility, lazy validators/registration, incremental codegen fixes |
| Convex                                    | 1.46.0              | 1.48.0              | October 22    | CLI secret redaction and provisioning fixes                                       |
| `@effect/tsgo`                            | 0.51.1              | 0.63.0              | October 28    | Supported patched compiler and lint set                                           |
| Oxlint                                    | 1.87.0              | 1.90.0              | October 27    | Type-aware rule selection and React Compiler crash fixes                          |
| oxlint-tsgolint                           | 7.0.2003            | 7.0.2005            | October 22    | Required by Oxlint 1.90 and supported by tsgo 0.63                                |
| Vitest                                    | 5.0.3               | 5.1.0               | November 2    | Mock import and timer/test-runner fixes                                           |
| React / React DOM                         | 19.3.0              | 19.3.1              | October 14    | Stable patch release                                                              |
| Base UI React / utils                     | 1.8.0 / 0.4.0       | 1.9.0 / 0.5.0       | October 9     | Focus, menu, dialog, and Strict Mode fixes                                        |
| React Router / plugin                     | 1.170.42 / 1.168.43 | 1.170.46 / 1.168.48 | October 22    | Stable compatible routing and generator patches                                   |
| AuthKit's indirect convex-helpers         | 0.1.124             | 0.1.133             | October 30    | Satisfies Workflow 0.4.10's `^0.1.127` peer within AuthKit's existing range       |

Confect CLI/server require Effect `~4.1.0`; all five Confect packages move
together. Effect integrations require `^4.1.2`. Effect Vitest accepts Vitest 5,
and Vitest 5.1 accepts Vite 8 and Node 24. The installed custom lint plugin
remains `github:daguttt/oxlint-plugin-effect-standards#v0.4.0`, including its
`@oxlint/plugins` 1.82.0 runtime dependency. tsgo's `upstream.json` explicitly
supports native TypeScript 7.0.2, Oxlint 1.90.0, and tsgolint 7.0.2005.

TypeScript 6.0.3, `@typescript/native` aliased to `npm:typescript@7.0.2`, Node
types 24.19.2, React Compiler 1.0.0, Tailwind 4.3.3, Vite 8.3.4, and
`dotenv-expand` 13.0.0 remain. pnpm stays at this template's 12.11.2, including
the byte-identical executable lock document. The source repo's 12.15 is not a
required runtime peer. pnpm 12.18 was published November 5, is tagged `next-12`,
and changes skill approvals/linking; it is deferred. Newer Convex, Oxlint,
tsgolint, tsgo, Vite and unrelated tooling releases were not chased. API
Extractor and unplugin-dts were not introduced.

## Phase results

### 0. Baseline

Fetched main, checked the clean worktree, ancestors and nested guidance,
remotes/default branch, all scripts, CI, catalogs, `.npmrc`, and both lockfile
YAML documents. The backend build only typechecks; root build runs that and
Vite. Root feedback uses semicolons, so each gate was also run independently.
Baseline frozen install, prepare, feedback, formatting, lint, all four
package typechecks, all suites, and build passed on Node 24.21.0.

Baseline tests: backend 33, frontend 32, UI 12, scripts 160, total 237.
Rollback is the initial SHA above. Next step was the coordinated backend set.

### 1. Effect, Confect, Workflow, Convex, and compiler

Installed the checked coordinated set and regenerated using the actual Confect
10.5 CLI. Generated services now expose `DocumentIds`; registered function
bridges use lazy definitions and registration. Tables, application specs,
middleware, refs, auth contracts, workflow implementation, and route tree did
not change. A second codegen run reports everything up to date.

An intermediate install correctly rejected tsgo 0.63 with the old Oxlint 1.87.
Installing the complete checked tsgo/Oxlint/tsgolint set resolved that error;
prepare then patched all four targets successfully. No compatibility check
was bypassed. Phase checks, all suites, and build passed after the recorder fix.

Effect 4.1's native subprocess arguments and environment values can be
`Redacted`. The shared invocation recorder now accepts those values and masks
them before recording. The regression test crosses the real spawner seam with
native redacted arguments/environment, visible values, and inherited values.
It failed with the old recorder's string operation and passes with the fix.
Existing exact-secret masking and command-error tests also pass.

Rollback: restore the complete backend/tooling dependency set, generated output,
recorder/test, and lockfile together, reinstall, and rerun prepare. Next step
was frontend/runtime alignment and indirect peer inspection.

### 2. Frontend and Node

React/DOM, Base UI, and Router/plugin move as checked compatible sets. The UI
package's utils peer range now also accepts 0.5. Node engines for all five
packages require `>=24.22.2 <25`; `.nvmrc` selects the same version. CI and PR
preview use `node-version-file` so future patch selection has one owner.
No deployment workflow was manually run.

The official macOS ARM64 Node archive was SHA256 checked against official
release sums and extracted under `/tmp/template-modern-stack-logs`. Checksum:
`aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a`.
The global Node installation was left alone. All final gates ran with that
Node 24.22.2 binary first on PATH.

Peer inspection found AuthKit's indirect convex-helpers 0.1.124 being reused
with Workflow 0.4.10, which requires `^0.1.127`. Refreshed only convex-helpers
inside its existing declared range to checked 0.1.133. The final peer report
contains only the pre-existing WorkOS mismatch below. No override or unused
direct dependency was needed.

Rollback: restore these frontend/runtime pins, the utils peer range, CI Node
selection, and their lock changes together. Next step was final verification.

### 3. Applicable Confect follow-ups and deferrals

Added one concise AGENTS line, following the `writing-for-agents` skill, to
restart running Confect watchers after TypeScript configuration, package
metadata, or dependency changes. It covers `dev:agent` and backend dev scripts.
The Convex routing/expert guidance was consulted for generated backend output.

There is no raw query/mutation context used only for `normalizeId`, and no
known-table untrusted string-ID boundary to replace. Workflow run arguments
already use `Id('exampleWorkflowRuns')`; callers consume generated Convex IDs.
WorkOS external IDs are provider strings, not Convex document IDs. The only
`Schema.Record` is WorkOS string metadata, not an ID-keyed map. No parsing
adapter, ID-keyed accumulator, synthetic feature, or negative compiler test was
added without an applicable site.

Upstream `DocumentIds.parse` accepts canonical IDs only, unlike normalizeId's
legacy V4/V5 conversion. It does not fetch a document or prove existence, and
is available to queries/mutations, not actions. `identify` is for unknown-table
IDs. This upgrade exposes the generated service but does not adopt it in app
code, so no ID compatibility, permission, tenancy, existence, or not-found
semantics change.

WorkOS 12 is deferred. This repo already used SDK 11.0.0 with AuthKit 0.2.10,
whose SDK peers are only 7 through 10. Latest AuthKit 0.3.0 still declares that
range. The existing mismatch is retained and documented, not copied from the
reference repo. Resolving it requires a separately scoped supported SDK/auth
combination and webhook/schema compatibility checks.

Rollback: restore the one-line guidance independently. No application migration
or live data operation is required. Next step was the independent reviews.

## Validation and limits

Final commands all passed on Node 24.22.2:

- `pnpm feedback`, with `pnpm format:check`, `pnpm format:check:all`, `pnpm lint`,
  and `pnpm typecheck:all --force` independently checked.
- `pnpm test:run:all --force`: backend 33 tests in 9 files, frontend 32 in 7,
  UI 12 in 2, scripts 161 in 15. Total 238, including the recorder regression.
- `pnpm build --force`: backend typecheck and normal Vite production build.
- `pnpm install --frozen-lockfile`, and repeat `pnpm confect:codegen`.
- Custom lint plugin's 399 upstream tests against the installed Oxlint 1.90
  test runner and its existing 1.82 plugin API. A first temporary copy omitted
  the plugin's Tailwind config and failed two fixture checks. Restoring that
  upstream config in the temporary test directory made all 399 pass.
- Confect dev starts and reaches generated-files-up-to-date. Vite dev starts
  and serves both `/` and transformed `/src/main.tsx` over localhost with
  nonsecret placeholders. Both processes were stopped afterward.

Existing suites exercise workflow query/action forwarding, retry options,
completion replay/idempotency, failure/cancellation outcomes, user isolation,
anonymous auth rejection, sign-in return paths, sign-out, and script setup/
teardown lifecycles. They do not certify a real cloud workflow or hosted sign-in.
There is no virtual-table scroll suite or tenant model in this template.
The application schemas/specs and permission checks remain unchanged.
Compiler suggestions and warning-level unstable-API diagnostics stay visible;
no lint rule was disabled. Existing jsdom scrollTo diagnostics remain.

Build/start used `VITE_CONVEX_URI=https://example.convex.cloud` and a synthetic
WorkOS client ID. No credentials were copied, no setup/provision/seed/reset,
deployment, financial webhook, extraction, Vercel env update, or live service
operation was performed. Full hosted login/cloud startup requires this
template's normal isolated setup and is outside this local verification.

The complete lockfile was parsed, including its executable document, all five
importers and 887 reachable snapshots. Every referenced snapshot resolves,
including the TypeScript alias. The executable document is byte-identical to
main; lock settings, workspace policy keys, `.npmrc`, and skill approvals are
unchanged. Pending TanStack skill approvals were left pending.

Registry audit counts are unchanged: 4 low, 20 moderate, 19 high, 1 critical.
No new advisory/version/path tuple was added. Some undici paths through Effect
were removed; other existing paths remain, so this is not a clean-audit claim.
Broad pre-existing advisory remediation is separate work. Raw logs, registry
metadata, the checksum, negative/positive recorder runs, gate exit codes, audit
JSON, and lock validation are in `/tmp/template-modern-stack-logs/`.

## Primary sources

- [Node 24.22.2 release and checksums](https://nodejs.org/en/blog/release/v24.22.2)
- [Confect CLI changelog](https://github.com/rjdellecese/confect/blob/8ebf17c/packages/cli/CHANGELOG.md)
- [Confect DocumentIds implementation](https://github.com/rjdellecese/confect/blob/8ebf17c/packages/server/src/DocumentIds.ts)
- [Effect releases](https://github.com/Effect-TS/effect/releases)
- [Workflow 0.4.10 changelog](https://github.com/get-convex/workflow/blob/v0.4.10/CHANGELOG.md)
- [Convex 1.48 changelog](https://github.com/convex/convex-backend/blob/1.48.0/npm-packages/convex/CHANGELOG.md)
- [tsgo 0.63 compatibility matrix](https://github.com/Effect-TS/tsgo/blob/%40effect/tsgo%400.63.0/_packages/tsgo/upstream.json)
- [Oxlint 1.90 release](https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.90.0)
- [Vitest 5.1 release](https://github.com/vitest-dev/vitest/releases/tag/v5.1.0)
- [React 19.3.1 release](https://github.com/facebook/react/releases/tag/v19.3.1)
- [Base UI 1.9 changelog](https://github.com/mui/base-ui/blob/v1.9.0/CHANGELOG.md)
- [Router releases](https://github.com/TanStack/router/releases)
- [convex-helpers changelog](https://github.com/convex/convex-helpers/blob/main/CHANGELOG.md)
- [AuthKit SDK peer ranges](https://github.com/get-convex/workos-authkit/blob/v0.2.10/package.json)
- [WorkOS 12 changes](https://github.com/workos/workos-node/releases/tag/v12.0.0)
- [pnpm 12.18 changes](https://github.com/pnpm/pnpm/releases/tag/v12.18.0)

## Independent review and publication

### Pass 1

Two independent fresh GPT-6.1 Sol High subagents reviewed the complete 20-file
staged/working-tree diff against freshly fetched main
`9119ec3f17f021ea50fcb814c364429977198b9e`. The code-review skill's comparison
used `git diff <base>` because the user required committing after review.

Standards: **COMPLETE PASS: ZERO ACTIONABLE FINDINGS**. Checked repository
standards and all twelve smell heuristics, recorder behavior/regression,
generated templates, exact installed compiler compatibility, Node/CI wiring,
unchanged auth/schema/ID semantics, and supply-chain policy.

Spec: **COMPLETE PASS: ZERO ACTIONABLE FINDINGS**. Checked the full task and
reference, coordinated compatibility, generated behavior, follow-up
applicability, all indirect consumers, validation evidence, and advisory delta.
No missing requirement, incorrect implementation, or scope creep was found.

Both independently verified the two-document lock and all 887 reachable
snapshots. They read test/build logs without claiming to rerun those gates.
No actionable findings required fixes, and no earlier completed review pass is
omitted. Exact reports are `review-pass1-standards.md` and
`review-pass1-spec.md` in the local log directory.

### Delivery

The authorized delivery is a normal non-forced fast-forward `HEAD:main` push,
with a fresh base check and CI verification on the actual published SHA.
The commit and published-SHA CI receipt are reported in the delivery response;
publication had not occurred when this report was committed. No PR is created.
