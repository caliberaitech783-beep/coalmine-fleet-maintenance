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
