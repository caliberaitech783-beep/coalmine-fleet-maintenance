# Nerve Center project workflow

This is the maintainer guide for the Nerve Center breakdown and fleet-management application. It describes the current source in this repository, the production flow, and the rules that connect users, masters, requests, reports, and deployment.

Production URL: [https://bdms.cmll.in/](https://bdms.cmll.in/)

## 1. What the application does

Vehicle transfers shows the standard **Sync Oracle** button without a date field and retains full-history sync behavior. The protected transfer-sync API still accepts an optional `fromDate` as `YYYY-MM-DD` for explicitly requested one-time syncs; it is inclusive and preserves earlier Oracle transfer records. Equipment Master sync remains unchanged.

Nerve Center is a mining-operations portal for:

- equipment and vehicle records;
- regions, sites, hierarchy, OEM, repair-type, privilege, and employee masters;
- production maintenance requests;
- maintenance editing, closing, and deletion;
- MIS verification and first-trip tracking;
- site-wise and OEM WhatsApp report preparation;
- dashboards, reports, and audit-oriented history.

The application has two interfaces:

1. **Super User workspace**: dashboard, masters, WhatsApp Integration, Reports, and Audit Trail.
2. **Mobile User workspace**: a role-specific request workspace for Production User, Maintenance User, or MIS User.

## 2. Architecture at a glance

~~~mermaid
flowchart LR
  Browser[React browser UI] -->|JSON + Bearer token| API[Express server]
  API --> DB[(PostgreSQL / Azure Database for PostgreSQL)]
  API --> Static[dist static assets]
  Git[GitHub branch azure-hosting] --> Actions[GitHub Actions]
  Actions --> Azure[Azure App Service]
  Azure --> API
  Azure --> DB
~~~

### Repository map

| Path | Responsibility |
|---|---|
| `src/main.jsx` | React entry point, login, navigation, dashboards, forms, master pages, request workflow UI |
| `src/style.css` and feature CSS files | Layout, theme, responsive behavior, loaders, charts, import dropzone, privilege and mobile workflow styling |
| `server.mjs` | Express server, database migrations, authentication routes, master CRUD, request workflow routes, static serving |
| `auth-session.mjs` | PostgreSQL-backed session creation and lookup |
| `mobile-access.mjs` | Account type and mobile role normalization plus server-side permission profile |
| `auth-role.mjs` | Login candidate filtering by requested access type |
| `password-auth.mjs` | scrypt password hashing, verification, initial-password setup, public user projection |
| `request-workflow.mjs` | India date/time validation and request state checks |
| `request-equipment.mjs` | Stable equipment selection and equipment-group labels used by the mobile request form |
| `equipment-identity.mjs` | Identity used to upsert duplicate equipment imports |
| `privilege-record.mjs` | Safe merging of duplicate privilege rows |
| `record-batches.mjs` | Splits large master imports into Azure-safe batches |
| `build-site.mjs` | Generates the app version, runs Vite, and writes deployment metadata |
| `.github/workflows/azure-hosting_coalmine-fleet-azure-783.yml` | GitHub Actions build and Azure deployment workflow |
| `test/*.test.mjs` | Node test suite for authentication, permissions, requests, equipment, dashboard metrics, and import helpers |

## 3. Local development

### Prerequisites

- Node.js 20 or newer. The GitHub workflow currently builds with Node.js 22.
- PostgreSQL, normally Azure Database for PostgreSQL in production.
- A `DATABASE_URL` connection string for any database-backed run.

Install dependencies and run the checks:

~~~powershell
npm ci
npm test
npm run build
~~~

Run the Vite development UI:

~~~powershell
npm run dev
~~~

Run the Express server against the generated `dist` directory:

~~~powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DATABASE"
npm start
~~~

`server.mjs` listens on `PORT` when set, otherwise port `3000`. The server serves `dist` when `dist/index.html` exists and otherwise serves the repository root.

## 4. Application startup and data loading

1. The browser loads `index.html`, then `src/main.jsx` mounts `<App />`.
2. The app restores `nerveCenterSession` from `localStorage` or `sessionStorage` if present.
3. The app checks `/api/app-version` every 10 seconds. A changed version clears browser sessions and reloads the login page. This is how a newly deployed UI logs out stale users.
4. The Express process starts listening immediately, then runs PostgreSQL migrations. If migration fails, the server retries every 30 seconds.
5. Successful migration seeds the six repair types once: Breakdown, Accidental, Preventive, Aggregate Repair, Super Structure, and WGM.
6. Each master page calls `GET /api/masters`. Master loaders remain visible until the request completes. The app displays a short data-load toast after a menu loads.

## 5. Authentication and role flow

The login form accepts the employee first name or configured login name, the password, and the selected Super User or Mobile User access type. The server does not trust the browser for the account data:

1. `/api/login` finds matching `Users & employees` records.
2. It filters candidates to the selected access type and verifies either the stored scrypt hash or the initial phone-number password.
3. It resolves the account type from the user record and the assigned mobile role from the matching Privilege record.
4. Mobile roles are limited to `Production User`, `Maintenance User`, and `MIS User`.
5. A PostgreSQL session is created in `auth_sessions`. The session contains the account type, login name, assigned role, and permission flags.
6. If `mustChangePassword` is true, the server creates a short-lived password-change session instead. The user must complete `/api/change-initial-password` before receiving a normal session.

New application users receive their registered phone number as the initial password. `initializeUserCredentials` marks the record for a mandatory first-login password change when a phone number is present. The new password must be at least eight characters and cannot equal the phone number.

### Mobile permissions

| Mobile role | Request visibility | Create | Edit | Delete | Close | Verify / first trip | Equipment master |
|---|---|---:|---:|---:|---:|---:|---:|
| Production User | Own requests | Yes | No | No | No | No | Read |
| Maintenance User | All requests | No | Yes when `edit` is granted | Yes when `delete` is granted | Yes | No | No |
| MIS User | Closed requests awaiting verification | No | No | No | No | Yes when `verify` is granted | No |
| Super User | All records | Administrative access | Administrative access | Administrative access | Administrative access | Administrative access | Full access |

The UI hides actions that the session does not expose, but the API repeats these checks. Direct browser or API calls cannot elevate a mobile user’s role.

## 6. Super User navigation and master flow

The Super User top bar contains:

- Dashboard;
- Masters menu;
- WhatsApp Integration menu;
- Users & employees is inside Masters;
- Reports;
- Audit Trail;
- day/night theme toggle.

The current Masters entries are Equipment master, Breakdown master, Repair type master, Region master, Vehicle transfers, Hierarchy master, OEM master, Users & employees, and Privilege.

Every generic master supports:

- live loading state;
- search and sortable columns;
- manual Add record form;
- CSV import with template download and drag-and-drop dropzone;
- CSV export;
- Delete all;
- row edit and delete where the page exposes actions.

Import behavior is master-specific:

- Users & employees rows get initial credential fields server-side. Incomplete employee-only rows can be stored, while application users without a phone cannot log in until completed.
- Equipment rows use `equipmentIdentity` to update an existing matching row instead of inserting a duplicate.
- Privilege rows are matched by normalized username and duplicate rows are merged safely.
- Large imports are split into batches of 250 in the browser helper.
- CSV headers can use either field keys or displayed labels. Equipment import includes aliases for legacy location, acquired date, chassis, and manufacturer-serial headings.

### Equipment master fields

The current equipment form and table use current location, equipment name, equipment category, equipment group, item name, item specification name, acquisition date, make, model, manufacturer serial number, engine number, chassis number, document status, asset number, and equipment status. Equipment rows also expose edit and delete actions.

### Privilege master fields

Privilege rows are linked to usernames from Users & employees and contain User Group, Super User/Mobile User selection, site selection, and Read, Edit, Delete, Verify, and Print flags. Changes are made inline and saved with the single Save all button in the page header.

## 7. Production request flow

~~~mermaid
sequenceDiagram
  participant P as Production User
  participant UI as Mobile request form
  participant API as Express API
  participant DB as PostgreSQL
  P->>UI: Choose Equipment group
  UI->>API: Load Equipment master
  P->>UI: Select equipment / door number
  UI->>API: Check for an active request on the door or chassis
  API-->>UI: Block immediately when the asset is already off road / under maintenance
  P->>UI: Enter date, time, complaint
  UI->>API: POST /api/requests
  API->>DB: Repeat the active-request conflict check
  API->>DB: Insert Open request with session owner/login
  DB-->>API: Saved request projection
  API-->>UI: Request row
~~~

The first selector in Create Request is **Equipment group**. It displays the Equipment master `group` value and uses the database record ID internally. Selecting a group still fills the matching door, registration, and site values. The request payload keeps the existing `equipment` key for compatibility.

After an equipment or vehicle is selected, the form checks `GET /api/requests/conflict` by normalized door number and chassis. Any request whose status is not `Closed` blocks the form, identifies the existing request in a popup and inline warning, and disables submission. `POST /api/requests` repeats the same check and has no duplicate override, so Production and Maintenance users cannot create a second active request for the same asset.

The form also supports manual 24-hour `HH:MM:SS` time entry and speech-to-text complaint input in supported Chrome/Edge browsers. The mobile submitted table shows Job reference, Equipment group, Door number, Site location, Days of breakdown, and the existing request fields. Days are calculated from the stored start timestamp and are not a separate database parameter.

## 8. Maintenance and MIS workflow

~~~mermaid
flowchart TD
  Open[Production creates Open request] --> Maint[Maintenance User edits or closes]
  Maint --> InProgress[In progress / Awaiting parts]
  Maint --> Closed[Closed with closing time and maintenance work]
  Closed --> MIS[MIS User verifies closed request]
  MIS --> Verified[Verified, optional first-trip date/time]
~~~

### Maintenance User

- Requests tab lists requests with edit and delete actions according to the assigned Privilege flags.
- Close request form links back to the original request and captures closing date, closing time, maintenance work, and status.
- Closed or verified requests cannot be edited through the edit route.
- Delete is a server-side operation and cannot remove a verified request.

### MIS User

- Verify closed requests lists only closed requests that are not already verified.
- Verify form shows the original equipment, door, registration, site, closure, and maintenance details.
- The First trip done checkbox reveals date and `HH:MM:SS` fields.
- Verification is accepted only for an unverified request with status `Closed`.

## 9. Dashboard and reports

The Super User dashboard is the mining-operations view. It loads Equipment master, Users & employees, Repair type master, and request data, then derives:

- top-row repair-type cards from the configured Repair type master;
- equipment totals and availability from `dashboard-equipment-metrics.mjs`;
- status counts for operational, maintenance, and breakdown equipment;
- region bars from the current WCL/NCL site list;
- fleet composition by Equipment group, category, or item name;
- request workload by status;
- user totals and a Mobile/Super/Admin drilldown;
- recent breakdown cases.

Reports include request-age highlighting. The shared styles mark requests about one day old yellow, two to four days orange, and more than five days red. The Reports and request tables use the same stored request start time as the Mobile days-of-breakdown value.

The General Report tab also carries the **In and Out Report**, the tabular twin of the dashboard Request Lifecycle graph. `in-out-report.mjs` builds one row per IST calendar day (from the earliest workflow event, capped at 366 days) with vehicles in (opened), vehicles out (maintenance closed, idle excluded), MIS verified, idle vehicles, net movement, the balance still in workshop and awaiting MIS verification at day end, average closure turnaround, and the vehicle and location lists behind each movement. The same module feeds the director bundle (`DIRECTOR_REPORT_TITLES[13]`, General department) and the daily 7 PM operational schedule, so the report can be scheduled, emailed, and downloaded in the reports ZIP like every other report.

## 10. WhatsApp Integration

The WhatsApp Integration menu contains:

1. **Daily site-wise report**: site rows with report-level checkboxes. Selecting a site/report prepares an alert for the selected recipient.
2. **Daily OEM report**: OEM rows with daily and L1/L2/L3/L4 selections, plus WCL/NCL filtering where configured.
3. **WhatsApp alert history**: the last 1,000 prepared alerts, including report type, target, level, recipient, phone, status, and timestamp.

The current implementation prepares and records alerts. The history is stored in `whatsapp_alert_history` and is protected by the Super User guard.

## 11. API reference

All protected calls use `Authorization: Bearer <session-token>`.

| Method | Endpoint | Guard | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Database health and server status |
| GET | `/api/app-version` | Public | Current UI version used for forced refresh/logout |
| POST | `/api/login` | Public | Authenticate and resolve account/role |
| POST | `/api/change-initial-password` | Password-change token | Complete mandatory first-login password change |
| GET | `/api/requests` | Session + read permission | Load request projections |
| POST | `/api/requests` | Production + create permission | Create an Open request |
| PATCH | `/api/requests/:reference` | Maintenance + edit permission | Edit an open request |
| PATCH | `/api/requests/:reference/close` | Maintenance + close permission | Save closure details and status |
| DELETE | `/api/requests/:reference` | Maintenance + delete permission | Delete an unverified request |
| PATCH | `/api/requests/:reference/verify` | MIS + verify permission | Verify a closed request and optional first trip |
| GET | `/api/masters` | Session | Load masters. Mobile access is limited to Equipment master |
| POST | `/api/masters/:master` | Super User | Add or import master rows |
| PUT | `/api/masters/:master/:id` | Super User | Edit a master row |
| DELETE | `/api/masters/:master/:id` | Super User | Delete one master row |
| DELETE | `/api/masters/:master/all` | Super User | Delete all rows in a master |
| GET | `/api/whatsapp-alert-history` | Super User | Load prepared alert history |
| POST | `/api/whatsapp-alert-history` | Super User | Record a prepared alert |

Request projections expose the compatibility keys `ref`, `equipment`, `door`, `reg`, `site`, `category`, `complaint`, `start`, `hours`, `status`, `owner`, `requesterLogin`, `closedAt`, `closedBy`, `maintenanceWork`, `verificationStatus`, `verifiedAt`, `verifiedBy`, `firstTripDone`, `firstTripAt`, and `firstTripBy`.

## 12. PostgreSQL data model

`server.mjs` runs idempotent migrations at startup. The main tables are:

- `master_records`: one JSONB row per master record, keyed by `master_name`.
- `maintenance_requests`: request identity, equipment, location, complaint, start/status, closure, verification, and first-trip fields.
- `auth_sessions`: active bearer sessions and resolved permissions.
- `password_change_sessions`: short-lived mandatory initial-password sessions.
- `app_metadata`: UI-version session invalidation and repair-type seed markers.
- `whatsapp_alert_history`: prepared WhatsApp report history.

The database connection uses `DATABASE_URL` and SSL with certificate verification disabled for the configured Azure PostgreSQL connection. Keep this variable in Azure App Service configuration or a local secret store. Never commit it.

## 13. CI/CD and Azure deployment

The tracked GitHub workflow runs on pushes to the `azure-hosting` branch and on manual dispatch:

1. Checkout the repository.
2. Install Node.js 22 with npm cache.
3. Run `npm ci`, `npm test`, and `npm run build`.
4. Upload the built repository as an artifact.
5. Log in to Azure using GitHub federated credentials stored as repository secrets.
6. Deploy the artifact to App Service `coalmine-fleet-azure-783` in the Production slot.

`npm run build` creates a new random `APP_VERSION`, builds the frontend to `dist`, writes `dist/app-version.txt`, and writes the static hosting metadata under `dist/.openai`. The server reads the version file and clears all active sessions when it changes.

### Safe release checklist

~~~powershell
npm ci
npm test
npm run build
git diff --check
git status --short
~~~

Commit only intentional source, test, documentation, and workflow files. Do not add `node_modules`, `dist`, deployment ZIPs, `.azure-cli`, or historical `azure-*` folders. Push the branch used by the configured GitHub workflow, then verify:

~~~powershell
Invoke-WebRequest https://bdms.cmll.in/api/health | Select-Object -ExpandProperty Content
~~~

Expected health output contains `"status":"ok"` and `"database":"connected"`.

## 14. Troubleshooting

### Login says the account is duplicated

Make the Login name unique in Users & employees for the selected access type. The server rejects ambiguous matches instead of choosing an account at random.

### Mobile login says no assigned role

Set the user’s User type to Mobile User, then set User Group in Privilege to exactly Production User, Maintenance User, or MIS User. Save all privilege changes and sign in again.

### The app shows a server error after deployment

Check `/api/health`, Azure App Service Log Stream, and the GitHub Actions build log. A build can succeed while database initialization is still retrying. Confirm `DATABASE_URL` is present and the PostgreSQL firewall allows the App Service.

### A newly deployed UI is not visible

The browser checks `/api/app-version` and should log out and reload automatically. If a stale tab remains, open the site again and confirm the response headers are not serving an old deployment.

### CSV import fails

Download the master’s CSV template, keep the first row as headings, save as UTF-8 CSV, and import in smaller batches if the file is large. Equipment imports upsert on identity; the same equipment should update rather than create a duplicate row.

### The site loads but no master data appears

Check the authenticated request in the browser network panel and `/api/health`. Super User master APIs require a valid session. Mobile users can only load Equipment master when their role profile grants equipment access.

## 15. Change map for future maintainers

When changing a feature, update the matching source, focused test, and this file if the public flow, role rule, API, database field, or deployment path changes. Run the release checklist before pushing. A change to the UI version is intentional: it forces active sessions to reload so users receive the same interface and permission model.
