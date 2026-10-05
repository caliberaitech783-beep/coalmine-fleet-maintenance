# Reversible request archival

Nothing is archived by deployment or startup. An authenticated Admin/Super Admin
must explicitly preview and execute the operation. Managers and operational users
cannot archive or restore.

The currently authorized scope is fixed in `request-archive.mjs`:

- Every site and request status.
- Actual `created_at` strictly before September 30, 2026, 00:00 Asia/Kolkata
  (`2026-09-29T18:30:00Z`). September 30 is excluded.
- No `verified_at` and neither verification status nor request status is Verified.
  Inconsistent records carrying either verification marker are conservatively kept.

## Operations

Use the application's existing authenticated session and normal CSRF protection.
Never expose session credentials or database credentials in a script or chat.

1. `GET /api/request-archives/preview` returns the exact references, count and token.
2. `POST /api/request-archives` with JSON `{ "token": "<preview token>", "reason": "<reason>" }`.
   A changed preview is rejected, not silently expanded. Record the returned batch ID.
3. `GET /api/request-archives` lists retained batch audit records.
4. To undo, `POST /api/request-archives/<batchId>/restore`. The whole batch is restored
   atomically, or rejected if a conflicting newer active vehicle request exists.

The request rows, files, remarks and all existing histories remain in place.
Only archive metadata changes. Active feeds, dashboards, counts, conflict checks,
reminders and operational detail access exclude archived requests. A database
trigger blocks edits and deletion of archived requests, including stale-tab writes.
Restoration retains the archive audit and returns requests to their unchanged state.
Existing site/role visibility rules still apply after restoration.

No permanent-delete endpoint is introduced. Do not use existing delete/reset actions
to perform an archive. Take and verify a normal database backup before a production
archive. Confirm live feed exclusion and archive count after the operation.
