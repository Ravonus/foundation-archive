# Security Policy

Thank you for helping keep foundation-archive safe for the artists, collectors, and archivists who rely on it.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security problems.**

Email the maintainer: **chadkoslovsky@gmail.com** with subject `[security]`.

Include, where possible:

- A description of the issue and its impact
- Steps to reproduce
- Affected component (this repo, the sibling `foundation-share-bridge` repo, or both)
- Any proof-of-concept code or logs (please redact anything sensitive)

You will receive an acknowledgment within 7 days. The maintainer will work with you on a fix and a coordinated disclosure timeline, typically within a **90-day** window from initial report.

## In Scope

Issues in any of the following:

- Archive ingest pipeline (contract scans, Foundation GraphQL client, metadata/media fetch)
- IPFS storage paths and local hosting routes
- Pairing / IPC surface between the site and `foundation-share-bridge`
- tRPC procedures, auth, and request validation
- Environment handling and secret leakage
- Dependencies used by this project (please include the advisory ID if applicable)

## Out of Scope

- Vulnerabilities in third-party services the project consumes but does not host: Foundation's public GraphQL API, upstream IPFS gateways (`ipfs.io` etc.), public Ethereum RPC providers. Report these to the upstream vendor.
- Denial-of-service against your own local deployment when run outside its documented configuration.
- Social-engineering or physical-access attacks.

## Disclosure

Once a fix ships, the maintainer may publish a brief advisory crediting the reporter (or keeping them anonymous on request). Please coordinate any public writeup with the maintainer so the fix is available before details are published.
