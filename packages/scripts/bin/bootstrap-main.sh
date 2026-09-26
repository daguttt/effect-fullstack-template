#!/bin/bash

# Make sure to check the root `package.json` file.
# There's a script to run this file using `pnpm`.
#
# One-time setup for the main checkout of a project created from this template.
# It creates (or selects) the Convex project that every linked worktree derives
# its own deployment from, then pushes the backend to the main dev deployment.
#
# The main deployment only anchors the project: `pnpm setup:worktree` refuses to
# run in the main checkout, so the WorkOS variables here are placeholders unless
# you set real ones. Existing values are never overwritten.

set -euo pipefail

usage() {
    cat <<'EOF_USAGE'
Usage: pnpm bootstrap:main -- [--team <team_slug>] [--project <project_slug>]

Without flags, Convex asks interactively which team and project to use.
Rerunning is safe: an existing CONVEX_DEPLOYMENT in .env.local is reused.
EOF_USAGE
}

TEAM=""
PROJECT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --team)
            TEAM="${2:?missing value for --team}"
            shift 2
            ;;
        --project)
            PROJECT="${2:?missing value for --project}"
            shift 2
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        --)
            shift
            ;;
        *)
            echo "unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"

if [[ "$REPO_ROOT" != "$MAIN_ROOT" ]]; then
    echo "Run this in the main checkout ($MAIN_ROOT). Linked worktrees use pnpm setup:worktree." >&2
    exit 1
fi

cd "$REPO_ROOT"

if [[ ! -f .env.local ]]; then
    cp .env.local.example .env.local
    chmod 600 .env.local
    echo "Created .env.local from .env.local.example"
fi

if ! grep -Eq '^CONVEX_DEPLOYMENT=.+' .env.local; then
    configure_args=(--configure new --dev-deployment cloud)
    [[ -n "$TEAM" ]] && configure_args+=(--team "$TEAM")
    [[ -n "$PROJECT" ]] && configure_args+=(--project "$PROJECT")

    # The first push fails until the WorkOS variables below exist; configuring
    # the project and writing CONVEX_DEPLOYMENT is all this step needs to do.
    pnpm exec convex dev --once "${configure_args[@]}" || true
fi

if ! grep -Eq '^CONVEX_DEPLOYMENT=.+' .env.local; then
    echo "Convex did not write CONVEX_DEPLOYMENT to .env.local; aborting." >&2
    exit 1
fi

existing_env="$(pnpm exec convex env list 2>/dev/null || true)"

# One variable per call: concurrent sets race on the deployment's config.
for key in WORKOS_CLIENT_ID WORKOS_API_KEY WORKOS_WEBHOOK_SECRET; do
    if grep -q "^${key}=" <<<"$existing_env"; then
        echo "Keeping the existing $key"
        continue
    fi

    value="placeholder"
    [[ "$key" == "WORKOS_CLIENT_ID" ]] && value="client_placeholder"
    pnpm exec convex env set "$key" "$value"
done

pnpm run confect:codegen
pnpm exec convex dev --once

echo
echo "Main checkout bootstrapped. Develop in linked worktrees:"
echo "  git worktree add ../<name> -b <branch> && cd ../<name> && pnpm setup:worktree"
