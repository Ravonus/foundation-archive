# Deployment

## Public repo and auto-update hook

This repo keeps the deployment hook in `.githooks/post-push`.

To enable it on a local clone:

```bash
git config core.hooksPath .githooks
cp deploy/deploy-hook.env.example .deploy-hook.env
```

Fill `.deploy-hook.env` with the SSH target, repo URL, deploy directory, and branch you want to auto-deploy. The hook only runs when the configured branch is pushed.

## Remote node layout

The production stack lives in Docker Compose at `deploy/docker-compose.yml`.

Services:

- `postgres`
- `web`
- `worker`
- `socket`
- `archiver`

Cold storage uses the NAS share defined by:

- `NAS_HOST`
- `NAS_SHARE`
- `NAS_ARCHIVE_SUBDIR`
- `NAS_USERNAME`
- `NAS_PASSWORD`

The share is mounted into the containers at `/mnt/backups`, and the app stores cold archive files under `ARCHIVE_STORAGE_DIR`.

Hot storage stays on the node in a local Docker volume and is exposed to the app at `ARCHIVE_HOT_STORAGE_DIR`.

## Remote env file

Create `deploy/.env.production` from `deploy/.env.production.example`.

At minimum, set:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_ARCHIVE_SOCKET_URL`
- `NAS_USERNAME`
- `NAS_PASSWORD`

Optional integrations such as `ETHEREUM_RPC_URL`, `KUBO_API_URL`, and `KUBO_API_AUTH_HEADER` can be added later.

## Manual deploy

Run this on the node after the repo has been cloned:

```bash
git config core.hooksPath .githooks
./scripts/deploy/remote-update.sh
```
