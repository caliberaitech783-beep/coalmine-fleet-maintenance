# BDMS backup and restore guide

BDMS disaster recovery requires four independent backup layers. A database file alone cannot rebuild the complete service.

| Recovery layer | What must be protected | Current method |
|---|---|---|
| PostgreSQL application data | Requests, users, masters, tickets, audit records, sessions, report rules, and integration settings | Admin > Backup Schedule; Admin > Export Backup; `scripts/backup-database.mjs` |
| Application code and Git history | Source code, every deployed commit, branches, tags, and required untracked working files | GitHub plus `scripts/backup-local.ps1` |
| Azure infrastructure | App Service, PostgreSQL server, Front Door, DNS/hostnames, slots, networking, and environment-setting names | Azure resource inventory maintained by the administrator |
| Credentials and external providers | Database, Oracle, email, Meta WhatsApp, Fast2SMS, GitHub, and Azure credentials; provider account ownership | Company password manager and each provider's recovery controls |

## Admin backup pages

- **Backup** shows recovery coverage and the last 100 backup operations.
- **Export Backup** creates a complete compressed PostgreSQL archive and asks where to save it on the administrator's computer.
- **Import Backup** checks the whole archive before restore. Only a Super Admin can restore, exact confirmation is required, and BDMS creates a safety backup first.
- **Backup Schedule** controls weekdays, a 12-hour IST schedule, protected storage folder, retention days, and maximum stored files.

Scheduled application backups are stored below `BACKUP_STORAGE_ROOT`. The default is `backups/` on Windows and `/home/data/bdms-backups` in Azure App Service. Set `BACKUP_STORAGE_ROOT` to a mounted persistent volume when a different protected server location is required. Folder names entered in the UI are kept inside this root.

Every database export is streamed row-by-row to compressed NDJSON, checked with SHA-256, and recorded in `backup_runs`. The file is not stored as one large database value, preventing the earlier `Invalid string length` failure.

## Complete local recovery set

Run from the project folder in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1
```

Choose another destination when required:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1 -Destination "D:\BDMS-Backups"
```

The local set contains:

| File | Purpose |
|---|---|
| `app-repository.bundle` | Complete Git repository, including branches and history |
| `app-source-<commit>.zip` | Source of the currently checked-out commit |
| `app-working-folder.zip` | Working files such as `work/` and `outputs/`; secrets, `.git`, `node_modules`, and `dist` are excluded |
| `bdms-data-<stamp>.ndjson.gz` | Every PostgreSQL public table in the portable BDMS format |
| `bdms-database-<stamp>.dump` | Optional native archive when `pg_dump` is installed |
| `table-counts.json`, `manifest.json`, `SHA256SUMS.txt` | Row-count and file-integrity evidence |

The database connection is read from `-DatabaseUrl`, the `DATABASE_URL` environment variable, or a git-ignored `.env` file. It is never printed or placed in the backup set.

## Restore

Use **Admin > Import Backup** for a checked application restore, or restore from the command line:

```bash
node scripts/restore-database.mjs --input bdms-data-<stamp>.ndjson.gz --database-url "postgres://..." --yes
```

The command-line restore empties and refills every included table inside one transaction. It refuses incomplete files and rolls back if a row count does not match.

For a native archive:

```bash
pg_restore --no-owner --no-privileges --clean --if-exists --dbname "postgres://..." bdms-database-<stamp>.dump
```

Restore the application repository with:

```bash
git clone app-repository.bundle coalmine-fleet-maintenance
```

Then recreate or repair the Azure resources from the maintained infrastructure inventory, re-enter secret values from the company password manager, point `DATABASE_URL` at the restored database, and deploy the required Git commit.

## Operating controls

1. Confirm a scheduled backup reaches `Completed` every day.
2. Export the latest archive to an encrypted company-controlled drive at least weekly.
3. Run `scripts/backup-local.ps1` after major releases and store one copy away from the application server.
4. Keep at least one off-site encrypted copy and one offline copy.
5. Test a restore into a separate database every quarter and compare its table counts with the manifest.
6. Never email or publicly share an unencrypted database archive. It contains operational data, password hashes, and integration credentials stored by the application.
