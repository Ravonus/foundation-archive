# Contributing to foundation-archive

foundation-archive exists to preserve Foundation (foundation.app) artworks at risk of disappearing as the platform winds down sales. The site is discovery + local IPFS backup; the code is public-good infrastructure, the art stays with the artists and collectors.

Contributions are welcome — bug fixes, doc improvements, and focused features that serve preservation.

## Local setup

See the **Local Setup** section of the [README](./README.md). Do not duplicate here; if setup steps drift, fix the README.

A sibling project, `foundation-share-bridge` (Rust), is the IPFS pinning helper artists run on their own machines. Cross-cutting changes that affect the pairing/IPC surface should be coordinated across both repos.

## Code-quality floor (hard gate)

Every PR **must** pass:

```bash
pnpm check   # runs: pnpm lint && tsc --noEmit
```

CI will reject anything that does not. No exceptions, no `// eslint-disable` without a WHY comment and maintainer sign-off.

ESLint enforces these as hard gates (see `eslint.config.js`):

- `max-lines`: **600** per file
- `max-lines-per-function`: **100** (**150** for `.tsx`)
- `max-params`: **3**
- `complexity`: **12**
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-non-null-assertion`
- `@typescript-eslint/no-floating-promises`
- Zod-backed boundary validation (external inputs, tRPC procedures, env)

If your change pushes a file past 600 lines or a function past the limit, split it — don't raise the ceiling.

## Coding conventions

- **Zod at every boundary.** HTTP, tRPC input/output, env, IPC with the bridge, filesystem reads of untrusted data, contract-scan results. Parse at the edge; pass validated types inward.
- **Client state via Zustand**, created through `src/stores/create-store.ts`. Do not instantiate stores ad hoc.
- **Layering** (rough, not religious):
  `schemas/` → `domain/` → `services/` → `stores/` → `components/`
  Lower layers do not import upward. Components do not call services directly — go through stores or tRPC.
- **No `any`.** If a type is genuinely unknown, use `unknown` and narrow with Zod.
- **No non-null assertions (`!`).** Narrow, branch, or throw a typed error.
- **Defensive `??` only at boundaries**, and only with a short `// WHY:` comment explaining the upstream source that can emit null/undefined. Inside the domain layer, types should already be non-nullable — use them.
- **tRPC procedures** are the typed API surface. Prefer adding a procedure over a one-off route handler.
- **Prisma** queries live in `services/`. Components and routers should not import `@prisma/client` directly.

## Commits and PRs

- Conventional-ish prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`.
- **Tiny atomic PRs preferred.** One concern per PR. A 200-line PR reviewed in an hour beats a 2000-line PR that sits for a week.
- Fill out the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md) — the checklist is the gate.
- Rebase on `main` before requesting review. Squash-merge is the default.

## Licensing and sign-off

foundation-archive is licensed under **Apache-2.0** (see [LICENSE](./LICENSE)). By opening a pull request you agree that your contribution is licensed under Apache-2.0 on the same terms as the rest of the project. No separate CLA.

## Good first issues

Small, well-scoped starting points:

- Bug fixes labeled `good first issue` in the tracker.
- Doc improvements — README clarifications, inline JSDoc on exported services, fixing stale setup notes.
- Tightening Zod schemas where a boundary currently accepts `unknown` or a loose shape.
- Replacing a `!` or `any` with a properly narrowed type.
- Adding a test for an existing service function.

If you are unsure whether a change fits the preservation scope, open an issue first and we will triage it before you spend time on a PR.
