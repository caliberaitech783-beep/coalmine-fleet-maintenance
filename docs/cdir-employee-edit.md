# C-Dir employee update approvals

Open C-Dir, open an employee profile, choose **Edit employee details**, enter the
proposed changes and a reason, then **Submit for approval**. Nothing is changed
in the live roster until approval. Employee ID remains read-only; location changes
must use Employee Transfer, with source approval followed by destination acceptance.

Nagpur HR can submit across locations. Other HR users can submit for assigned
locations only. Directors and administrators can submit globally but cannot bypass
approval. Every site's employee changes require that site's assigned Project
Manager. Nagpur/Chandrapur office records require the office's assigned HR Manager.
An HR Manager cannot substitute for a site PM. Requesters cannot decide their own
updates, transfers or deletions. Missing independent approvers block submission.

**C-Dir → Directory Update Approvals** is available on desktop and mobile to HR,
HR Managers, administrators, directors and PMs. It shows pending/history registers,
old versus proposed values, requester, reason and location decision history.
Approve applies the changes only when every affected location has approved.
Reject requires a reason and keeps the original values. Registers, comparisons
and history use the shared print/PDF/Excel controls.

The profile editor, Employee/Contact Masters and CSV creation batches all use
`cdir_change_requests`. Batch imports remain entirely pending until every involved
location approves. Existing identities must be edited, not re-imported as duplicates.
Contact creation requires an already-approved employee. Contacts shared across
placements need approval from every affected location; ambiguous name-only matches
are refused. Master edits require the original record snapshot; stale forms cannot
overwrite newer data. New and old clients cannot save directly.

Pending updates, transfers and deletions cannot overlap for an employee. Database
updates, decisions and notifications commit together; failures roll everything back.
Final approval rechecks records, locations and current approver assignments. Approval
history is stored separately from the live records and is included in full backups.

Employee/contact deletion requires approval for administrators too; bulk deletion is
blocked. HR cannot mutate shared reference definitions. Administrators may maintain
unused reference definitions, but definitions already used by approved employees
cannot be changed directly to cascade around approval. Deployment roster replacement
is restricted to initial provisioning; existing employee/contact rosters cannot be
replaced by a new deployment payload. An already-applied payload remains a no-op.
