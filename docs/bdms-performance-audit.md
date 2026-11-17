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

# Dashboard rendering and first-load audit — 17 November 2026

## Evidence and scope

Measured locally, not in production. The real `Dashboard` component (compiled
from `src/main.jsx` the same way `test/dashboard-live-date-ui.test.mjs` does)
was rendered in Node with child components stubbed and a dependency-aware
`useMemo`, using synthetic production-sized data: 2 regions, 6 sites, 1,600
assets and 4,000 requests over 120 days. Timings are medians of 30 renders on
the development PC and measure only the Dashboard's own calculations and element
creation, not browser layout or paint. Bundle sizes come from `npm run build`.
No production data was used.

## Confirmed bottlenecks and fixes

1. Every page view downloaded the 400 KB jsPDF bundle (130 KB gzip). Rolldown's
   vendor groups capture their dependencies, so Vite's chunk preload helper was
   pulled into `pdf-vendor` and the entry imported that chunk. A higher-priority
   `codeSplitting` group gives the helper its own chunk. Storage management,
   Retention rules and Purge data also load on demand. First-load download went
   from about 700 KB to 571 KB gzip (`4618931e`).
2. Every Dashboard redraw (filter, card click, drill-down, data refresh) took
   about 390 ms whether or not anything had changed. CPU profiling showed 42% of
   that time in `canonicalSiteName`, which normalised the same few site
   spellings millions of times per render, and 17% in `requestDateKey`.
   Bounded, string-keyed caches now cover `canonicalSiteName`,
   `requestDateKey`, the fleet `identityValue` text and the category-mix
   creation time. `Date` objects are never cached, and per-record fleet
   identities stay scoped to one calculation as before.
3. The stage pipeline re-scanned every request for every site × stage pair. It
   now works out each request's stage once and counts each site in one pass.
4. The combined-fleet records and counts, OEM breakdown rows, visible LMVs and
   the region/site fleet summary were rebuilt on every render. They are now
   memoised on their inputs; `react-hooks/exhaustive-deps` reports no missing
   dependency on them (and does flag one when it is removed deliberately).

After items 2–4 a redraw takes about 34 ms with the same data (`2c614113`).

## Validation

The complete rendered element tree (every prop and child, about 3.6 MB
serialised) was byte-identical to the previous version across 11 views:
default, region, Total/OEM/Breakdown fleet views, single site, 30-day range,
and three views after a data refresh that closes half the requests and opens
300 new ones. `test/dashboard-render-cost.test.mjs` covers the caches, including
correct answers past each cache limit and re-reading a mutated `Date`. The full
suite passed locally, also under `TZ=UTC`.

## Deployment note

The fast UI lane deploys only commits limited to `src/`, `public/`,
`index.html` and tests, and runs a focused test subset. A commit that also
changes any other file is skipped while its run still reports success, so check
`/api/app-version` for the deployed commit. Because the fast lane skips most
of the suite, a UI commit can leave the full suite red until the next full
Azure build (on 17 November, four export tests were stale after an
`ExportMenu` prop rename and blocked the full build until fixed in
`97fae219`). Test-only commits trigger neither deployment.

## Production follow-up

Confirm in the browser on a production-sized account, for example with the
Performance panel while changing a dashboard filter. Remaining candidates:
redraws caused by parent `App` state changes (the Dashboard is not wrapped in
`React.memo` and receives new callback props), and desktop tables that render
every row.
