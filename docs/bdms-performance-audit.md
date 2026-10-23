# BDMS request-feed performance audit — 22 October 2026

## Evidence and scope

The production health endpoint at the start of this audit reported source commit
`5081d5936176299b9f768751222931f26b2b442f`, database connected, pool total 7 / idle 6 /
waiting 0, and shared-feed counters of 879 hits and 4,688 reads (15.8% cache hits).
These are cumulative counters, not a controlled latency benchmark or proof of
database saturation. No production SQL, credentials, business records or media
were exported. No production EXPLAIN ANALYZE or authenticated API latency trace
was available during this code audit, so no endpoint latency improvement is claimed.

## Confirmed bottlenecks and fixes

1. Every non-GET/HEAD HTTP request cleared the shared request feed twice, including
   `/api/session-heartbeat` and `/api/user-activity`. Those exact POST handlers
   update only session/activity telemetry. Exempt them from invalidation; all
   other writes (including unknown routes and different methods) still clear
   the cache before processing and after responding. Authentication and role/site
   filtering still run on every feed request. PostgreSQL request/master revision
   checks still invalidate changes from other instances.
2. A feed load taking longer than its cache TTL could be duplicated by new polls
   before it finished, increasing database pressure precisely when reads were
   slow. Share pending loads for the same revision, then start the TTL on success.
   Clearing the cache or changing revisions still forces a fresh load; completion
   or failure of an old load cannot replace or remove a newer cached entry.
3. Feed enrichment serially read Equipment Master and daily remarks even though
   the reads are independent. Start both with Promise.all. Keep the same SQL,
   parameterized reference filter, remark ordering, door resolver, delayed-reason
   normalization and response shape. The requests query still runs first.

## Validation

Behavioral regressions cover 200 interleaved telemetry/poll pairs requiring one
feed load, actual/unknown writes and database revision changes forcing reloads,
slow pending loads, mutation overlap, read failure, concurrent enrichment,
unaltered source rows, door mapping and full daily remark history. Existing
role/site authorization and Info Pulse tests are included in the focused checks.
This synthetic load-count result is not a claim of a 200x production speedup.

No schema migration, index creation, data deletion, retention change, permission
cache, pagination/record truncation or infrastructure resizing is included.
The existing first-trip scalar lookups, per-request activity writes, feed size
and report jobs remain candidates for production measurement rather than
speculative changes.

## Production follow-up

Compare feed counter deltas (not lifetime ratios) and slow_http_request logs over
equivalent peak periods, including request count, p50/p95 latency and database
pool waiting. For database tuning, obtain read-only pg_stat_statements aggregates
if enabled, inspect plans for the slowest query fingerprints and parameterized
representative scopes, then test any index change separately. Preserve the
existing immediate write refresh and cross-instance revision checks.
