# Metrics and data flow

## Definitions

For N probes in the selected window, S successes, F failures, and target T expressed as a fraction:

- Availability = 100 × S / N.
- Allowed failures = N × (1 − T).
- Budget remaining = max(0, 100 × (allowed failures − F) / allowed failures).
- Burn ratio = F / allowed failures. It compares observed failure rate to the target allowance for this sample window; it is not a multi-window alerting policy.
- p95 is the nearest-rank 95th percentile of successful-probe latency samples. Failed probes are excluded from latency, but included in availability.

No samples produce null metrics. Latest sample older than 15 minutes produces a stale state. Otherwise an active incident takes precedence, then an availability breach, then healthy. The history strip shows at most the latest 36 probes in the window; the metric calculation uses every probe in the window.

These are sample-based metrics. Irregular schedules and missing observations can bias results. The application does not fill gaps with assumed successes, infer elapsed downtime, or advertise a compliance SLA. No percentile interpolation or weighted aggregation is performed.

## Consistency and security boundaries

Sample IDs are durable idempotency keys. Replayed content is ignored; conflicting content causes the entire batch to roll back. Dates are normalized to UTC before comparison. Prepared statements bind all caller-controlled values. SQLite WAL mode and a five-second timeout support short transactions.

Every incident transition and its note commit together. Each transition increments a version and rejects stale writers. Resolution needs a note of at least ten characters. The event log is local history, not a tamper-resistant audit ledger.

Mutation routes compare bearer credentials using constant-time comparison after a length check. Request origins must match. Missing operator configuration disables writes. The Next.js server binds to loopback in the local scripts; the container exposes a loopback host mapping. Read endpoints remain open within that boundary. Never use the sample token in a shared environment.

## Operating limits

Single Node process and local SQLite filesystem; no cluster coordination. No automatic retention purge, Prometheus scraping, paging, alerts, or vendor API integration. Copy database files only while stopped, or use SQLite online backup tooling. New database schemas require versioned migrations. The current schema initializes version 1 only.
