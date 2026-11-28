# Production performance investigation, 28 November 2026

Live health sampling captured all ten operational database connections busy with
14 queries queued. Health response times ranged from 0.33 to 1.56 seconds.

The available retained application logs (25 November) contain 5,042 slow
`/api/requests` events, averaging 5.86 seconds within that slow-event sample,
with a maximum of 37.94 seconds and queues reaching 118. These are not averages
of all requests. Notification events mostly include an intentional 25-second
long-poll wait and must not be interpreted as database execution time.

Read-only production inspection found 28,478 unarchived requests. The exact
request-feed SELECT took 476 ms in EXPLAIN ANALYZE, before transferring the rows,
door resolution, daily-remark attachment, JSON serialization and compression.
The sampled notification SELECT took 10 ms. PostgreSQL statement statistics are
not installed, so historical per-query execution aggregates were unavailable.
The table scan counters are cumulative, not a per-minute rate.

Production changed from 8e051b90 to 83f55757 during the investigation. The newer
release already prevents simultaneous full-feed scans during mutation bursts
and isolates Diesel sign-in. This patch is based on that newer release.

The patch retains unchanged revision-validated feed generations for five minutes
instead of 30 seconds. Every request still checks database revisions before
using the feed; writes still clear it immediately. This avoids unnecessary full
reads and repeated large JSON serialization across quiet polling windows.

Slow HTTP logs now subtract only the measured notification subscription wait;
authentication and both database reads remain measured. Database pool queries
over the configured threshold emit duration, pool queue sizes, operation, error
code and a stable SQL hash. SQL text and parameter values are never logged.
Durations include queueing as well as execution. Transaction-client queries are
outside this pool-level instrumentation.

No production records, retention settings, indexes or database extensions were
changed during the investigation.

## Follow-up from the newly available logs

After the first release, live query sampling caught the Info Pulse projection
running for over three seconds, and its new query timing event measured 4,652 ms
without pool queueing. Unlike the workflow feed, this endpoint launched a full
request-table read for each caller. It now shares that raw projection using the
existing revision-validated feed cache. Authorization, role/site filtering and
daily-history attachment still run separately for each caller. A concurrency
regression verifies thirty simultaneous callers use one source read without
sharing their filtered histories, and that revision changes and writes refresh it.

Warning-level application file logging was enabled after release; the existing
HTTP log capacity (35 MB) and retention (three days) were preserved.
