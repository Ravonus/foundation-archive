<!--
Keep the title short (under 70 chars). Use conventional-ish prefixes:
feat: / fix: / chore: / docs: / refactor: / test: / perf:
-->

## Summary

<!-- 1–3 sentences: what changes, and why. -->

## Linked Issue

<!-- Closes #NNN, or "N/A — small/obvious change" -->

## Test Plan

<!-- Bulleted checklist of how a reviewer should validate this PR locally. -->
- [ ] 
- [ ] 

## Checklist

- [ ] `pnpm check` passes locally (lint + typecheck clean)
- [ ] Zod schemas added or updated at any new input/output boundary
- [ ] No new `any`, no new non-null assertions (`!`)
- [ ] No new files over 600 lines, no new functions over 100 (`.ts`) / 150 (`.tsx`) lines, no new functions over complexity 12
- [ ] Any new `// eslint-disable` has a `// WHY:` comment and is defensive (crosses a real runtime boundary)
- [ ] README / CONTRIBUTING / relevant docs updated if contributor ergonomics changed
- [ ] One concern per PR — unrelated cleanups split out
