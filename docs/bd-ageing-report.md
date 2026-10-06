# BD Ageing Report

Open **Reports → BD Ageing Report** (also available from the Reports page).

Only authenticated logins `MOHITCHADDA`, `MANISHCHADDA`, `RAHULCHADDA`, and
`THAKUR@1990` may access this report. Login matching follows the application's
case-insensitive convention. Display names, permissions checkboxes, and admin
roles do not grant access. The API independently checks the allowlist before
loading records and disables response caching.

Age is exact elapsed time from the recorded breakdown start, not creation or
acceptance time, calculated using one server timestamp per refresh:

- 2–4 days: 48 hours inclusive to 96 hours exclusive.
- 4–6 days: 96 hours inclusive to 144 hours inclusive.
- More than 6 days: strictly greater than 144 hours.

Under-two-day requests and invalid/future starts are omitted. The existing open
breakdown definition excludes closed, verified, and idle requests. Archived and
globally retired requests are excluded. Each user's existing Info Pulse site
scope is retained. Rows show oldest first within each group.

This is a read-only report. Refresh reloads current status and ageing. One table
has All ageing, 2–4 days, 4–6 days and More than 6 days tabs. Region and dependent
site filters narrow the existing authorized data; changing region resets site.
Tab counts respect the location filters. The same filtered rows feed the table
and existing export controls. Search and column selection remain available.
It does not change request workflows, scheduled reports or other users' access.
