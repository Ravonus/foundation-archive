# `src/schemas`

Zod schemas are the single source of truth for any shape that crosses a boundary: network responses, persisted client state, form submissions, and (where applicable) tRPC input/output contracts. A TypeScript type declared without a matching runtime schema is acceptable only for purely in-process shapes.

## Conventions

- One file per domain: `src/schemas/<domain>.ts` (e.g. `ui-preferences.ts`, `archive-filters.ts`).
- Each file exports **both** the Zod schema and its inferred type:
  - Schema name: `xSchema` (camelCase, `Schema` suffix).
  - Type name: `X` (PascalCase) via `z.infer<typeof xSchema>`.
- Schemas are pure data definitions — no side effects, no I/O, no framework imports.
- Prefer `.strict()` on object schemas that describe persisted state to reject unknown keys on rehydrate.
- Bump a store's `persist.version` whenever its schema gains a breaking change; write a migration in the store if older shapes must be preserved.
- Re-use primitives across schemas by factoring them into `src/schemas/_shared.ts` rather than duplicating.

## Example

```ts
import { z } from "zod";

export const exampleSchema = z.object({ count: z.number().int().nonnegative() }).strict();
export type Example = z.infer<typeof exampleSchema>;
```

Consumers (`src/stores/*`, tRPC routers, forms) import the schema, call `safeParse`/`parse` at the boundary, and rely on the inferred type everywhere downstream.
