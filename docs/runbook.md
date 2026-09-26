# Local incident exercise

1. Seed and open the console. Confirm the synthetic Orders API incident and failing probes.
2. Enter the configured local operator token. Select the incident and read the initial update.
3. Advance to identified with a concrete explanation of the simulated cause.
4. Advance to monitoring with the simulated remediation and a verification plan.
5. Generate/import fresh synthetic probes. Explain that one successful probe is not sufficient evidence of sustained recovery in a real system.
6. Advance to resolved with a meaningful verification note. Export the report for the exercise record.

A second tab with a stale version should receive a conflict instead of silently overwriting newer history. Refresh and review the latest notes before trying again.

If the API reports no data, check the selected time window and seed/import path. If stale, inspect observed_at timestamps and feed cadence. If a write returns 401, verify the local operator token; if 503, configure ADMIN_TOKEN with at least 12 characters and restart Next.js. Do not paste tokens into incident notes.

This exercise uses fictional telemetry. A real incident requires evidence from the actual system, appropriate change approval, stakeholder communication, and a rollback plan.
