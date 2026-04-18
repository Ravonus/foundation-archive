# Foundation Archive

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
Next.js 15 / TypeScript

<!-- CI badge: add once workflow name is confirmed -->

T3 app for preserving Foundation works for the decentralized marketplace.

## About this project

Foundation Archive is an open-source preservation project released under the Apache License, Version 2.0. The goal is to make it practical for artists, collectors, and archivists to keep durable local copies of Foundation works alongside pinned CIDs on their own infrastructure.

Maintainer: Ravonus <chadkoslovsky@gmail.com>.

It pairs with the companion Rust desktop helper [`foundation-share-bridge`](https://github.com/ravonus/foundation-share-bridge), which is what the `/desktop` board verifies. The standalone desktop bridge now lives in that repo, while the `rust-archiver/` crate in this repo remains the server-side archive sidecar used by the web app and Docker deploy.

It does three things in the first version:

1. Index Foundation works through RPC-first contract scans, with Foundation page scraping as fallback/enrichment.
2. Give artists a public lookup that cross-checks the local archive against live Foundation creator/work discovery.
3. Store local backup copies under a predictable IPFS-style folder structure and pin the original CID representation through your own Kubo node when configured.

The current pass also adds:

4. A persistent auto-crawler that resumes Foundation contract scans from the last saved block range in Postgres.
5. A smart archive budget that starts at 1 MB for automatic backlog work and widens over time so smaller roots are rescued first.
6. A socket-driven live UI for queue, crawler, and recent pin activity.

## What is in the app

- Public archive search at `/archive`
- Dedicated public profile pages at `/profile/:username-or-wallet`
- Desktop bridge status board at `/desktop`
- Artwork detail pages with backup state and local asset links
- Admin queue console at `/admin`
- Local asset hosting route at `/ipfs/:cid/:path`
- Internal worker route at `/api/internal/process-jobs`
- Persistent worker script at `pnpm worker`
- Live socket daemon at `pnpm socket`

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS v4
- tRPC
- Prisma + Postgres
- Rust archive archiver sidecar for streamed download/pin throughput
- Zustand for client-side state
- Motion for UI animation
- `viem` for contract-log scanning
- `multiformats` for CID version detection

## Environment

The archive app expects Postgres.

Copy the values from `.env.example` if you need a fresh env file.

Useful variables:

- `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/foundation_archive?schema=public"`
- `ARCHIVE_STORAGE_DIR="./archive-storage"`
- `ARCHIVE_HOT_STORAGE_DIR="./archive-storage-hot"`
- `FOUNDATION_BASE_URL="https://foundation.app"`
- `FOUNDATION_GRAPHQL_API_URL="https://api.prod.foundation.app/graphql"`
- `IPFS_GATEWAY_BASE_URL="https://ipfs.io"`
- `ETHEREUM_RPC_URL="https://..."` (Ethereum mainnet, chain 1)
- `BASE_RPC_URL="https://mainnet.base.org"` (Base, chain 8453 — required to archive Foundation drops on Base)
- `KUBO_API_URL="http://127.0.0.1:5001"`
- `KUBO_API_AUTH_HEADER="Bearer ..."` or another full `Authorization` header value
- `ARCHIVE_ARCHIVER_URL="http://127.0.0.1:43131"` to enable the Rust sidecar from the Next/worker process
- `ARCHIVE_ARCHIVER_MEMORY_CACHE_ITEMS="512"` to tune the Rust recent-root in-memory cache
- `ARCHIVE_ARCHIVER_INLINE_MEMORY_MAX_BYTES="8388608"` to control how much a single root can buffer in RAM before it streams into hot storage
- `INTERNAL_CRON_SECRET="change-me"`
- `NEXT_PUBLIC_ARCHIVE_SOCKET_URL="http://127.0.0.1:43129"`
- `NEXT_PUBLIC_SITE_URL="http://localhost:3000"` so the desktop helper's toolbar menu knows which `/desktop` board to open
- `ARCHIVE_SOCKET_PORT="43129"`
- `AUTO_CRAWLER_ENABLED="true"`
- `AUTO_SCAN_BLOCK_WINDOW="50000"`
- `AUTO_SCAN_CONTRACTS_PER_TICK="1"`
- `SMART_PIN_START_BYTES="5242880"`
- `SMART_PIN_CEILING_BYTES="268435456"`
- `SMART_PIN_GROWTH_FACTOR="2"`
- `SMART_PIN_DEFER_MS="60000"`

## Local setup

```bash
pnpm install
pnpm db:start
pnpm db:push
pnpm contracts:seed
pnpm dev
pnpm archiver:dev
pnpm socket
pnpm worker
```

`pnpm dev` now assigns each local Next server its own `.next-dev-<port>` cache, so you can run more than one local app instance without the dev build artifacts colliding. Use `pnpm clean:dev` if you want to clear every local dev cache manually.

If you want a quick local Postgres for development, the repo includes `docker-compose.postgres.yml` on port `54329`.

If you need to rebuild the schema in this environment:

```bash
pnpm db:bootstrap
```

For ad hoc TypeScript smoke tests or one-liners, use the ESM-safe eval entrypoint:

```bash
pnpm tsxe -- "import 'dotenv/config'; console.log('ok')"
```

## Queue flow

### Manual ingest

1. Open `/admin`
2. Queue one or more Foundation mint URLs or contract scans if you want manual overrides
3. Run `pnpm worker` on your server
4. Run `pnpm socket` so the UI can receive live queue and pin updates

The worker will:

- auto-seed tracked Foundation contracts
- resume block-range crawling from the last saved cursor
- scrape the Foundation mint page
- query Foundation’s live GraphQL API for artist/work discovery in the public lookup
- create or update the contract record
- resolve the IPFS metadata/media roots
- queue a backup job
- estimate large automatic roots and defer them until the smart budget widens
- stage the asset(s) through the Rust hot cache when `ARCHIVE_ARCHIVER_URL` is enabled
- process queued archive jobs concurrently so the Rust multithreaded archiver can keep multiple roots moving
- promote the final archive file into `archive-storage/ipfs/<cid>/...`
- pin by the original CID text through Kubo if configured

### Contract-first ingest

You can queue scans in two modes:

- Block-range mode
  Best option when you have `ETHEREUM_RPC_URL`. The worker reads ERC-721 `Transfer` logs from the contract and queues only known token IDs.
- Token-range mode
  Useful fallback when you know the likely token ID range but do not want to wait on RPC log discovery.

## Storage layout

Downloaded files are placed here:

```text
archive-storage/
  ipfs/
    <cid>/
      metadata.json
      nft.mp4
      ...
```

When the Rust archiver sidecar is enabled, it keeps a warm staging layer here first:

```text
archive-storage-hot/
  ipfs/
    <cid>/
      metadata.json
      nft.mp4
      ...
```

Small roots are buffered in memory first by the Rust service, then written into the
hot cache and promoted into cold storage. Larger roots are streamed directly into
the hot cache and then promoted, so the Node worker does not have to hold the
whole file in memory.

The app serves them back through:

```text
/ipfs/<cid>/<relative-path-inside-root>
```

That gives you a local hosting layer for backed-up metadata and media.

## Notes

- The queue, worker heartbeat, crawler state, smart budget state, and live event history are all persisted in Postgres.
- Foundation does not expose a clean public registry of every historical creator contract, so the app combines contract-driven discovery, Foundation GraphQL lookups, and Foundation-page scraping.
- CID version is stored alongside every root, and the worker uses the original CID text when pinning so v0/v1 stays faithful to the source reference.
- The Rust sidecar listens on `127.0.0.1:43131` by default. Override it with `ARCHIVE_ARCHIVER_BIND`. You can also tune `ARCHIVE_ARCHIVER_MEMORY_CACHE_ITEMS` and `ARCHIVE_ARCHIVER_INLINE_MEMORY_MAX_BYTES`.
- The standalone `foundation-share-bridge` helper exposes a basic native toolbar/taskbar icon on macOS, Windows, and Linux with a small menu for opening `/desktop`, opening local health, and quitting cleanly.
- The public archive and admin screens use sockets for live updates. The default live socket port is `43129`.
- `/desktop` is the live verification board for the local Rust bridge. It is meant to confirm that artists' own helper nodes are reachable and self-repairing, not to replace a durable personal IPFS pinning setup.

## Contributing

Contributions are welcome. Please read:

- [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, workflow, and expectations
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community guidelines
- [SECURITY.md](./SECURITY.md) for how to report security issues privately

Before opening a pull request, run `pnpm check` and confirm it passes cleanly. The repo enforces a strict quality floor (typed lint rules, `max-lines` 600, `max-lines-per-function` 100/150, `max-params` 3, `complexity` 12).

## License

This project is licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).
