# Deployment

## Public repo and auto-update hook

Automatic node updates are driven by a server-side `post-receive` hook on the deployment node.

On your local clone, configure `origin` to push to both GitHub and the node bare repo:

```bash
./scripts/deploy/configure-origin-push-mirrors.sh
```

That keeps GitHub as the public source of truth while also sending each push to the node, where the bare repo hook fast-forwards the working tree and runs `./scripts/deploy/remote-update.sh`.

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

Current public production values:

- `NEXT_PUBLIC_SITE_URL=https://foundation.agorix.io`
- `NEXT_PUBLIC_ARCHIVE_SOCKET_URL=https://socket-foundation.agorix.io`
- `ARCHIVE_SOCKET_INTERNAL_URL=http://socket:43129`

Use a real websocket-capable public socket host for `NEXT_PUBLIC_ARCHIVE_SOCKET_URL`. Pointing it at the main Next app origin leaves `/socket.io` behind an HTTP rewrite, which can trap clients in polling instead of upgrading.

`ETHEREUM_RPC_URL` is still optional.

`KUBO_API_URL` is not optional if you expect works to advance from "Almost saved" to "Saved". The production compose stack includes a `kubo` service, and the production env should point `KUBO_API_URL` at `http://kubo:5001`.

`KUBO_ARCHIVE_STORAGE_DIR` is the absolute path at which the kubo container sees the same cold-storage tree the worker writes to `ARCHIVE_STORAGE_DIR`. In our compose that's `/data/cold-storage/foundation` (cold-storage has to live under kubo's IPFS root `/data` for filestore/`--nocopy` adds to be accepted). Leave it unset when both ends see the same path (e.g. local dev).

## Manual deploy

Run this on the node after the repo has been cloned:

```bash
./scripts/deploy/remote-update.sh
```
