#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
hook_config="${FOUNDATION_ARCHIVE_DEPLOY_CONFIG:-$repo_root/.deploy-hook.env}"
branch="${1:-$(git -C "$repo_root" branch --show-current)}"

if [[ ! -f "$hook_config" ]]; then
  echo "Missing deploy hook config at $hook_config" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$hook_config"

: "${DEPLOY_SSH_TARGET:?DEPLOY_SSH_TARGET is required}"
: "${DEPLOY_REPO_DIR:?DEPLOY_REPO_DIR is required}"
: "${DEPLOY_REPO_URL:?DEPLOY_REPO_URL is required}"

ssh "$DEPLOY_SSH_TARGET" /bin/bash <<EOF
set -euo pipefail

repo_dir=$(printf "%q" "$DEPLOY_REPO_DIR")
repo_url=$(printf "%q" "$DEPLOY_REPO_URL")
branch=$(printf "%q" "$branch")

if [[ ! -d "\$repo_dir/.git" ]]; then
  git clone "\$repo_url" "\$repo_dir"
fi

cd "\$repo_dir"
git fetch --prune origin

if git show-ref --verify --quiet "refs/heads/\$branch"; then
  git checkout "\$branch"
else
  git checkout -B "\$branch" "origin/\$branch"
fi

git pull --ff-only origin "\$branch"
git config core.hooksPath .githooks
./scripts/deploy/remote-update.sh
EOF
