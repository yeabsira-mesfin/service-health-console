# Security hardening guide

Service Health Console is a local operations lab. The current shared operator token protects mutation endpoints, but it is not a production identity or authorization system.

## Before shared deployment

- Require authenticated identities for both reads and writes.
- Replace the shared operator token with named users or service identities and role-based authorization.
- Enforce per-service permissions server-side for incident and telemetry operations.
- Terminate TLS at a trusted edge and set secure response headers.
- Store secrets in a managed secret store instead of local files.
- Add request throttling, abuse protection, and explicit payload limits at the edge.

## Telemetry protections

- Keep ingestion idempotency and conflicting-ID rejection covered by tests.
- Authenticate probe senders and authorize them for specific service IDs.
- Validate clock skew, batch size, and timestamp age before persistence.
- Define retention and deletion rules for probe and incident data.
- Separate synthetic/demo data from any production telemetry source.

## Incident integrity

- Keep optimistic version checks on incident updates.
- Record named actor identity on every lifecycle transition in a production design.
- Protect audit history from unauthorized modification and define retention.
- Require explicit authorization for report export if reports can contain sensitive operational data.

## Verification

Security-sensitive changes should add tests for unauthenticated requests, insufficient permissions, cross-service access, replay/conflict behavior, malformed payloads, secret handling, and failure-safe behavior.

The current project should continue to be described as a local lab until those controls are implemented and verified.
