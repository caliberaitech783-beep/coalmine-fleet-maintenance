# C-Dir employee editing

Open an employee profile in C-Dir, then choose **Edit employee details**.
Existing Admin/Super Admin accounts and the exact authenticated login
`MAHAKDUDANI` can use this editor. Other directory users remain read-only.
The exception does not grant access to Masters, user permissions, passwords,
creation or deletion.

The editor loads the exact employee master record ID, not a name lookup.
Employee ID remains read-only. Employee details and associated contact details
are saved in one transaction, only on Save changes. Cancel leaves them unchanged.
The directory reloads after saving and an Audit Trail entry records changed fields.
Contact fields are shared across placements with the same employee ID.

Concurrent edits return a conflict instead of overwriting a newer record.
Ambiguous contact matches and unsafe name-only shared identities must be
reconciled in Masters before editing. Existing C-Dir master permissions and
the global read-only directory browsing workflow are unchanged.
