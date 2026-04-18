#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

origin_fetch_url="$(git remote get-url origin)"
node_push_url="${1:-ssh://ravonus@192.168.1.190/home/ravonus/foundation-archive-deploy.git}"

git remote set-url --push origin "$origin_fetch_url"
git remote set-url --add --push origin "$node_push_url"

git remote get-url --all --push origin
