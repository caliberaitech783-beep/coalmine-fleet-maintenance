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
| `request-correction-policy.mjs` | Allow-listed lifecycle correction fields, evidence validation, snapshots, and correction status rules |
| `src/request-corrections.jsx` | Admin correction submission/application and PM approval workspace |
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

For an isolated loopback PostgreSQL fixture that does not enable TLS, also set
`DATABASE_SSL=false`. Leave it unset in Azure so production continues to use TLS.

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

Team User location assignment supports multiple site checkboxes in both Add and Edit. **All sites** selects every listed site; clearing an individual checkbox excludes it. The selection is stored as normalized site names separated by ` | ` in `site` (and mirrored in `location` by the form), preserving existing single-site records. All sites is a selection of the current list, so newly added sites require assignment. At least one site is required in the form. Live server checks use `userSiteScope` for requests, equipment, request creation and updates, MIS evidence and verification, and team tickets; stale manager report settings never widen Team User scope. Multi-site users select one assigned site when creating a ticket. Role and menu permissions still apply within the assigned sites.

**General User** is available under **Team User** when adding or editing Users & employees. Its desktop and mobile menu selections default to **Dashboard** and **Tickets** only. **Requests** and **Reports** are available as unchecked options; selecting them grants read-only access to the assigned location. Saved selections, including an empty selection, are retained. Switching another role to General User starts with the General User defaults. General User never receives request creation, editing, deletion, closure, verification, or master administration permissions. The API checks the union of the configured desktop/mobile menus; dashboard data uses `GET /api/requests?scope=dashboard` and remains site-scoped.


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

While submission is in progress, the form pauses background conflict checks and ignores late check responses so a refresh cannot flag the newly created request as its own duplicate. Repeated submit events are blocked immediately. The request list adds the server-confirmed row after a successful POST, and the form closes without waiting for another list refresh. The API acknowledges the committed database transaction before running opening reports and notifications; delivery failures are logged without changing the successful creation response.

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
- After maintenance accepts a request, every dashboard, request table, filter, export and report derives the visible lifecycle from the recorded timestamps: `Accepted` after acceptance and `In progress` after work starts. A stale stored `Open` value must not be displayed once either event has been recorded.
- Close request form links back to the original request and captures closing date, closing time, maintenance work, and status.
- Tippers capture separate HMR and KMR readings at opening and closing. Edit request has one shared **Trip card upload** for the opening readings; Close request has one shared **Trip card upload** for the closing readings. Existing single-meter readings remain associated with their original meter, and missing opening readings can still be filled at closure. Closing readings and uploads remain optional for maintenance updates.
- Request projections include `openingMeterReadings` and `closingMeterReadings` maps keyed by `HMR`/`KMR`, stored in additive JSONB columns. The single `openingMeterReading`/`closingMeterReading` and `meterType` fields remain compatible with older requests and clients. MIS verification pre-fills saved closing readings and preserves the closing trip card.

### Controlled request corrections

Lifecycle records are never edited directly after an entry error. The responsible operational user opens **Request correction**: Production User can request a correction to their own Off Road entry, Maintenance User can request Maintenance acceptance or On Road correction, and MIS User can request MIS verification correction. The user proposes only allow-listed field changes, explains the reason, and attaches a mandatory JPG, PNG, or WebP evidence image. The live maintenance request remains unchanged while the correction is pending.

Project Managers and Production Managers receive an in-app notification and use **Correction approvals** in their manager profile. A manager can approve or reject only corrections belonging to an assigned site, and must record a review remark. Approval does not change the request by itself: it unlocks **Apply approved correction** under **Admin > Request corrections** for Admin and Super Admin. Application re-checks that the original fields have not changed, validates the complete lifecycle timestamp order, updates the request in one database transaction, records timeline corrections, and writes user submission, PM review, and Admin application events to the Audit Trail. Rejected, stale, and unapproved corrections never alter the source request.
- Closed or verified requests cannot be edited through the edit route.
- Delete is a server-side operation and cannot remove a verified request.

### MIS User

- Verify closed requests lists only closed requests that are not already verified.
- Verify form shows the original equipment, door, registration, site, closure, and maintenance details.
- The First trip done checkbox reveals date and `HH:MM:SS` fields.
- Verification is accepted only for an unverified request with status `Closed`.

## 9. Dashboard and reports

**Actions → Columns** supports named table layouts: save the displayed columns in their current order, rename or update a selected layout, delete it, or restore the default columns. Choose a layout in the column dialog and press **Apply**, or select it from the table toolbar's **Layout** dropdown to apply it immediately. Saving a layout does not apply a draft until Apply is chosen; Cancel discards unapplied column edits. Layouts are scoped to the signed-in account and table/column set in this browser, independently of Smart Print layouts and saved report views. They retain column visibility and order; switching layouts leaves filters, sort and date selections unchanged. Resetting a table keeps its named layouts. Shared tables continue to remember the applied column arrangement across refreshes.

Tables with a breakdown-days or elapsed-time column start with **Highest to lowest time taken** selected. Days of breakdown is the primary sort when more than one duration is present; otherwise the first duration column is used. This includes operational workspaces, dashboard and OEM drilldowns, duration reports, and Audit Trail duration. Sorting uses the underlying elapsed time, so equal displayed day counts still order by minutes and missing durations stay last. Users can select lowest-to-highest, another column, or Clear sort; filtering and live row updates retain that choice. Reset table/report restores the descending duration default.

The dashboard opens in **OEM BD**, site-wise across all permitted WCL and NCL sites. Region, Site, From/To, and OEM remain visible while scrolling and in the OEM/full-fleet detail dialog. The Site filter is available for All regions as well. A chart segment sets the corresponding Region, Site, and OEM filters; a site total keeps the selected OEM. OEM legend entries set OEM, while **All total breakdown** and **View full list** retain every current header filter. Changing a header filter updates the chart, open list, title, and counts together, and resets the list's local search/category/group/status filters. Zero-result selections remain empty. Reset restores all permitted regions/sites/OEMs and today's live breakdown view.

Fleet view labels change the chart; the bold count buttons open their matching records. Blank chart/card areas and headings do not open lists. Total shows the current fleet for the selected location/OEM, while OEM breakdown dates include requests overlapping the chosen interval. Counts represent distinct assets; the detail context separately reports request records when an asset has multiple requests. The full list contains a separate table for each matching site, headed by its region, site name, and record count. The repeated Site column is omitted. Each site supports sorting, filtering, print, and export, with row numbers starting at 1 in the displayed order. OEM names appear inside segments with sufficient space; hover or keyboard focus exposes the name, color, site, and exact count for every segment, including small ones.


**Tracking Vehicle Throughput** starts with empty dates and an **All time** period. Selecting either date initially selects that single day; the From/To controls can then extend the inclusive range. Clearing either date or clicking **Reset dates** clears both dates and restores full-history BD movement and live availability, independently of the top-level dashboard date. The panel's Region filter reveals a Site filter limited to that region's authorized sites; changing or clearing Region resets Site. These selections apply to BD totals, the type mix, site tables, availability counts, exports, and linked detail lists. Dated availability is the fleet snapshot at the end of the selected To day (live when To is today). Opening an all-time site's day-wise details starts at its earliest recorded request, without truncating history to one year.

Info Pulse opens as four KPI cards over a single ranked list. BD balance (selected by default) counts every open request in the user's scope that is not idle, closed or verified, once; Critical counts those standing 24 hours or more, Warning those standing 12 to 24 hours, and Open those under 12 hours. Clicking a card narrows the list to that tier and the three tiers add up to the balance. Rows are tinted red, amber or purple by tier. Filters mirror the dashboard record browser: region tabs (WCL/NCL, shown when the scope spans more than one region), Site chips (shown for multi-site scopes) and Equipment / Vehicle chips (KMR requests are vehicles, HMR equipment, older requests classified by group name), each counted within its parent, plus an inclusive Started From/To range in IST with Until today, Today, 7D/14D/30D and All dates presets. The range defaults to Until today (no From, To = today): the BD balance as of now, every open breakdown started on or before today, undated requests included. Reset selection restores that default and every region. The KPI counts, list, record count and captions follow these filters. There is no pagination or drill-down. Rows run longest standing first and show the site, door/registration, equipment group and reference, status, the breakdown reason, standing since, down-for time (with a bar relative to the longest-standing breakdown) and the ETC, flagged as overdue or due in. The header trigger badge shows the same BD balance. Existing server-side site scope remains in force. The feed refreshes on request changes and every 30 seconds, displays its last successful refresh time, and distinguishes loading or failed refreshes from a zero balance. Existing impossible same-day AM ETC values that precede the breakdown are interpreted as their PM counterpart only when that 12-hour correction falls after the breakdown; new ETC changes must be later than the server's current time. The existing login-only one-minute display and manual reopening remain unchanged.

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
| GET | `/api/requests/:reference/audio/:kind` | Session + request scope | Load complaint or maintenance audio on demand |
| POST | `/api/requests` | Production + create permission | Create an Open request |
| PATCH | `/api/requests/:reference` | Maintenance + edit permission | Edit an open request |
| PATCH | `/api/requests/:reference/close` | Maintenance + close permission | Save closure details and status |
| DELETE | `/api/requests/:reference` | Maintenance + delete permission | Delete an unverified request |
| PATCH | `/api/requests/:reference/verify` | MIS + verify permission | Verify a closed request and optional first trip |
| GET | `/api/tickets` | Session + ticket scope | Load compact CRM ticket projections |
| GET | `/api/tickets/:reference/media/:kind` | Session + ticket scope | Load ticket audio or attachments on demand |
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

The tracked GitHub workflows run on pushes to `azure-hosting` or `azure-hosting-1.0` and on manual dispatch:

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

### Valid login fails with a duplicate session public ID

Reverting the System Administration feature left `auth_sessions.session_public_id` and its unique index in databases where that feature had run. Its old empty-string default makes a second session fail with PostgreSQL `23505` on `auth_sessions_public_id_idx`.

Startup calls `repairLegacySessionDefaults` to set `gen_random_uuid()::text` as the default only when that legacy column exists. Existing sessions, identifiers, permissions, and the unique index are preserved. Fresh databases without the column continue to work. Do not resolve this error by clearing sessions or removing uniqueness.

`test/auth-session-schema.test.mjs` runs a real PostgreSQL regression when `AUTH_SESSION_TEST_DATABASE_URL` is configured (`AUTH_SESSION_TEST_DATABASE_SSL=false` for local PostgreSQL). It uses a temporary table inside a rolled-back transaction, reproduces the legacy failure, and verifies repeat sign-ins, existing-session continuity, and idempotent repair. The Azure build runs it against an isolated PostgreSQL service.

### Login says the account is duplicated

Make the Login name unique in Users & employees for the selected access type. The server rejects ambiguous matches instead of choosing an account at random.

### Mobile login says no assigned role

Set the user’s User type to Mobile User, then set User Group in Privilege to exactly Production User, Maintenance User, or MIS User. Save all privilege changes and sign in again.

### The app shows a server error after deployment

Check `/api/health`, Azure App Service Log Stream, and the GitHub Actions build log. A build can succeed while database initialization is still retrying. Confirm `DATABASE_URL` is present and the PostgreSQL firewall allows the App Service.

Since the transient-failure hardening the app no longer answers a bare `Server error`:

- `server-error-response.mjs` turns database connection drops (PostgreSQL restarts, slot swaps, `ECONNRESET`, SQLSTATE classes 08/57/53/40) into HTTP 503 with `Retry-After: 5` and the message "The server is reconnecting to the database. Please retry in a moment." Route errors that carry a status keep that status and message; anything else is a 500 whose message tells the user to retry or contact the administrator. Every 500 is logged with its method and URL, so search the Log Stream for `[500]`.
- `pool.on('error')` and `process.on('unhandledRejection')` keep the process alive when an idle database connection breaks; before this a single dropped idle connection exited Node and every user saw errors until App Service restarted the container.
- `src/api-transient-retry.mjs` makes the browser wait and retry read-only `/api/` requests that receive 408/425/429/502/503/504 or a dropped connection (about 19 seconds across five attempts, honouring `Retry-After`). Writes are never replayed. A message still reaches the user only when the outage outlasts the retry window.

If a user still reports a server error, the Log Stream line tagged `[500]` names the failing route and stack; fix that route and add a regression test.

### A newly deployed UI is not visible

The browser checks `/api/app-version` and should log out and reload automatically. If a stale tab remains, open the site again and confirm the response headers are not serving an old deployment.

### CSV import fails

Download the master’s CSV template, keep the first row as headings, save as UTF-8 CSV, and import in smaller batches if the file is large. Equipment imports upsert on identity; the same equipment should update rather than create a duplicate row.

### The site loads but no master data appears

Check the authenticated request in the browser network panel and `/api/health`. Super User master APIs require a valid session. Mobile users can only load Equipment master when their role profile grants equipment access.

## 15. Change map for future maintainers

When changing a feature, update the matching source, focused test, and this file if the public flow, role rule, API, database field, or deployment path changes. Run the release checklist before pushing. A change to the UI version is intentional: it forces active sessions to reload so users receive the same interface and permission model.

## 16. Unified WhatsApp delivery and report settings

**Reports → WhatsApp delivery settings** is the central Admin / Super Admin panel for organisation-wide routing, delivery switches, reminders, CRM fallback timing and message templates. It links to **Role default schedules** and **My report schedule**. Every eligible signed-in user, including Admin and Super Admin, also opens **Reports → My report schedule** directly. The separate Admin-menu Report Setting entry and duplicate Hierarchy Master timing editor are removed. Hierarchy Master retains report assignments and site access, with a link back to Reports for timing.

Settings and template-management requests re-resolve the signed-in user's current Users & employees / Privilege profile; a stale administrator session does not grant settings access after demotion. Provider setup and delivery history remain under **WhatsApp Integration → Meta API setup / WhatsApp alert history**.

### Recipient policy and CRM privacy

| Audience | Immediate request alerts, reminders and daily updates | CRM ticket-created / resolved alerts | Scheduled reports |
| --- | --- | --- | --- |
| Production, Maintenance and MIS operational users | All four request-status events and daily maintenance updates at the same assigned site by default, across request categories | Their own tickets only | Assigned fleet reports using their role or personal schedule |
| Managers, including Project / department managers, and Directors | Hard-excluded | Hard-excluded | Reports only, within authorised sites; manager CRM reports include all ticket categories at those sites |
| Admin and Super Admin | Hard-excluded | Hard-excluded | All fleet reports in fresh role defaults, plus CRM reports; saved report selections and schedules remain effective |

The four request-status events are **Opened / Off Road**, **Closed / On Road**, **MIS Verified** and **Marked Idle**. Their default recipient roles are Production supervisor, Maintenance supervisor and MIS supervisor. Operational recipients must match the request's canonical assigned site. Admin, Super Admin, Manager and Director accounts are reports-only and cannot be selected for these immediate alerts or their reminders. A saved WhatsApp number is required, and delivery still obeys the global and message-purpose switches.

Leadership exclusion is enforced in recipient selection and again at immediate delivery; old role selections, generic CRM/daily-update calls and duplicate-login records cannot opt Admin, Super Admin, Manager or Director accounts back in. Classification uses `whatsAppRecipientRole()` rather than treating the legacy Super User account type as Super Admin. Manager/Director job or recognised Director-name classification takes priority over a legacy Admin fallback; a real Super Admin authority remains reports-only for WhatsApp operational events.

**CRM alerts stay private:** ticket creation and resolution notify the operational ticket owner only, not leadership or every operational user at the site. Scheduled Admin, Super Admin and manager CRM reports have a separate authorised-site audience and include all CRM categories, without filtering by the creator's department. This reporting rule does not broaden interactive CRM ticket access. WhatsApp audience selection is separate from the existing in-app notification recipients.

### Delivery controls and defaults

| Control | Default / behaviour |
| --- | --- |
| All WhatsApp delivery | On; covers alerts, reminders, reports, manual sends and password reset OTPs |
| Message types | Scheduled fleet reports, CRM-created/resolved alerts, daily updates, manual reports and OTPs enabled |
| Direct alerts | All four events enabled for the default operational and administrator roles; Manager / Director are not selectable |
| Off Road escalation | One escalation after four hours; configurable from 1–168 hours, using Opened recipients |
| Idle reminder | Repeats hourly; configurable from 1–24 hours, using Marked Idle recipients |
| Quiet hours | Off; editable daily IST window initially 22:00–07:00 |
| Scheduled CRM reports | On; Admin, Manager and Super Admin account types; include empty site reports by default |
| CRM fallback timetable | Every day at 08:00, 15:00 and 20:00 IST; up to six times; applies only when that user has no applicable saved personal schedule |
| Report files | Site-specific PDF and XLSX download links, valid for 14 days |

Turning off Opened or Idle also pauses its corresponding reminder. Existing overdue requests may qualify on the next reminder check after an interval change. Quiet hours suppress non-OTP delivery; immediate event alerts are not queued, while an overdue reminder may qualify later. The global switch also blocks OTPs. Scheduled jobs check every minute while background jobs are running and use a 20-minute delivery grace period; this is not an unlimited replay of missed deliveries. Messages already handed to the provider cannot be recalled.

### Role defaults, My report schedule and legacy timing

| Scope | UI entry | Storage and API |
| --- | --- | --- |
| Organisation role defaults, Admin / Super Admin only | **Reports → WhatsApp delivery settings → Role default schedules** | `app_settings` key `hierarchy_report_schedules`; `GET /api/report-schedule-settings` and `PUT` with `{designations: ...}` |
| Own personal schedule, including administrators | **Reports → My report schedule**, or the link inside delivery settings | `app_settings` key `hierarchy_report_schedule:user:<login>`; `GET /api/report-schedule-settings?scope=personal` and `PUT` at the same URL with `{userSchedule}` |
| Return to defaults | **My report schedule → Use role default** | `PUT /api/report-schedule-settings?scope=personal` with `{resetToDefault: true}` deletes only that login's personal copy |

The explicit `?scope=personal` is essential for administrators: it selects their own schedule instead of editing the organisation's role defaults. The response includes `canManageAll`, permitted designations/reports, `userName`, `userLogin` and `userSchedule`; the latter is null when no personal copy is saved.

Users can select Daily, Weekly or Every N days, edit IST minute slots, add/delete rows and choose from reports assigned to their role. An active row requires a time and a report. Unsupported report selections are dropped on save. Explicit cadence wins over stale weekday/interval fields. The existing Every N days rule remains calendar-based: days N, 2N, etc. of each month; its previous occurrence can therefore be more or less than N days away across a month boundary.

Existing role and personal timings are retained. Before a role is saved centrally, legacy Hierarchy Master `scheduleDays` / `scheduleTimes` are applied and shown as the **effective** role timetable. Saving role defaults marks submitted designations `managedByReportSettings: true`; subsequent delivery uses those central timings instead of legacy Hierarchy Master timing. Hierarchy report assignments and site restrictions continue to apply. Editing a report/site tick in Hierarchy Master is not a second timing editor.

A matching personal schedule replaces the role timetable for that login only. The role Active switch still gates that personal schedule, and recipient/report/site restrictions still apply. Saved personal schedules under a different designation are ignored. Saving one user's schedule never changes another user's timing or the shared role default; removing a report or slot from a saved list does not automatically restore General Reports at 19:00.

For **fleet reports**, use the effective role timetable unless a matching personal schedule replaces it. For **CRM**, a matching saved personal schedule supplies that user's delivery slots and takes priority over the organisation CRM fallback. With no applicable personal copy, CRM uses `crm.days` / `crm.times` (08:00 / 15:00 / 20:00 by default), independently of the role's fleet timetable. A paused or empty applicable personal schedule does not silently fall back to global CRM times. Global CRM controls and authorised-site/account-type checks still apply. Resetting one user's personal schedule restores fleet role defaults and CRM fallback timing for that user only.

**Reports are timed only.** Every event is no longer a selectable frequency, `reportsForHierarchyEvent()` returns no reports, and event-driven sender entry points skip publication. Normalisation folds legacy event-selected report titles into an existing active timed row without changing that row's days or times. Event-only personal copies can inherit current role timing; disabled selections remain disabled, and explicitly paused/empty role timing is not reactivated. Unplaced selections are retained in paused rows for later editing. Removing the UI option alone is not the delivery guard.

### Reporting windows, complete activity and site bundles

For each due delivery, use `[previous scheduled occurrence, current scheduled occurrence)` in IST. The previous occurrence is determined across **all active report rows in the user's effective personal/role timetable**, not independently per row. For example, with one active row at 08:00 and another at 15:00, the 15:00 delivery covers 08:00–15:00 rather than starting at yesterday's 15:00. Rows due at the same occurrence contribute to the same window and their report selections are combined. The end is the scheduled time, not the delayed scheduler run time or the last successful send. Daily minute slots, weekly days and existing calendar intervals must use their actual previous occurrence across midnight, weekends and month boundaries. CRM without a personal schedule uses adjacent occurrences of its fallback timetable.

The activity window is inclusive at the start and exclusive at the end. Activity exactly at a slot boundary belongs to the next window. Include **every case with activity in the window**, even if it opened and closed during that same window; do not use only the current open backlog or discard an opening because the case has since closed.

- Fleet activity includes opening, maintenance acceptance, closure, MIS verification, Idle marking, Idle approval / On Road, first-trip verification and timestamped daily maintenance remarks. Older cases qualify when they have new activity in the window. Cases with no window activity are not repeated as backlog.
- The fleet bundle starts with **All request activity in this window**, then the selected non-empty report tables. The complete activity table prevents status-specific report views from hiding a case that changed status several times. Lifecycle fields are bounded to the window end; fleet master totals in selected reference tables remain current snapshots rather than a historical event ledger.
- CRM includes tickets created or resolved in the window. A ticket created and resolved within the window remains included once with its timestamps. A later resolution must not make an earlier window report the ticket as already resolved.

Fleet and CRM publish **separate bundles for each authorised site and delivery window**. Each fleet site bundle has one PDF containing its report sections and one XLSX workbook containing the corresponding sheets; CRM similarly publishes one PDF and XLSX for that site's ticket activity. Each recipient receives one consolidated WhatsApp message per report family and scheduled window, covering all their selected permitted locations. The message has a bold LOCATIONS heading, the IST window, per-site counts and site-labelled PDF and Excel links. There is no Notes field or extra notes paragraph. Both files are stored in `published_reports` and linked through `/r/<short_code>` for **14 days**. Full case details stay inside the files. No combined multi-site file is substituted for the site-specific links.

Recipient site scope is resolved before publication and intersected with applicable hierarchy restrictions. Managers without an authorised site/region are skipped; a hierarchy row cannot broaden their access. Dispatch claims in `whatsapp_consolidated_report_runs` are scoped by occurrence and recipient (plus the report family/flow/schedule identity), covering all selected locations in one send, and delivery outcomes are recorded in `whatsapp_alert_history`. Repeated scheduler polls deduplicate claims; failed report attempts may retry up to three attempts within the eligible delivery window.

Scheduled Availability Report figures use the exact delivery window, including downtime carried over from incidents already open at the start. Those incidents contribute to interval availability without being repeated as new case activity. Manual month-to-date availability reports retain their existing behavior.

### Version-3 policy migration, reset and persistence

Settings are stored under `app_settings` key `whatsapp_report_settings`. `normalizeWhatsAppReportSettings()` upgrades settings to **version 3**. Pre-version-2 records receive the unified operational defaults. Version-2 records retain valid operational/OEM selections while Admin and Super Admin are removed from immediate-event recipient lists. Scheduled CRM recipients remain unchanged.

The routing migration preserves saved global/event delivery pauses, reminder settings, CRM days/times and empty-report preference, quiet hours, template choices and version-2 channel switches. Role/personal schedules have their separate timed-only normalisation described above. Once version 3 is saved, permitted custom role selections and explicitly disabled generic channels are retained; all leadership immediate-alert exclusions remain enforced. Legacy CRM summary-only/PDF-only/combined formats normalise to linked PDF and XLSX files.

**Reset delivery rules** loads default delivery rules into the draft while preserving existing CRM days/times and all message-template choices; role and personal schedules are stored separately and remain intact. Other delivery controls return to defaults, including delivery switches and reminder/quiet-hour settings. **Save settings** applies that draft. This action is separate from **Use role default**, which removes only the current user's personal schedule.

Delivery-settings saves check `{settings, revision}` under a database advisory lock and return HTTP 409 for a stale revision. Settings writes and template actions are audited. The shared Meta/Fast2SMS sending layer reads the current policy before sending, including a second check after PDF upload; settings read failures cannot bypass the global pause. No settings-panel endpoint sends a WhatsApp test message.

### Provider setup and template purposes

Provider credentials remain under `app_settings` key `meta_whatsapp`, separate from delivery settings; server-held approval snapshots use `whatsapp_template_approvals`. The panel endpoints are `GET /api/report-settings`, `PUT /api/report-settings` with `{settings, revision}`, and `POST /api/report-settings/templates` with `{action: "submit" | "refresh"}`.

To activate wording: choose a purpose and sample/custom text, **Save settings**, **Submit saved template choices**, then **Refresh approval status**. New variants use names derived from purpose and content, preserving existing provider templates. Custom text is limited to 1,024 characters and must retain all numbered placeholders exactly once and in order. Saved wording becomes effective only after its provider status is recorded as APPROVED; pending, rejected or paused choices use the existing standard fallback. Selected custom template submission is explicit. Startup submits missing standard definitions and refreshes approval status; deployment does not send sample messages. Authentication OTP wording remains fixed. Previews use sample data and do not change report contents, recipients, permissions or timing.

The gallery retains **ten samples for all 40 purposes (400 samples)**: 28 named reports from `DIRECTOR_REPORT_TITLES` and 12 consolidated, manual, alert and reminder purposes. Styles include Current standard, Compact summary, Structured detail, Executive brief, Action focused, Team handover, Review checklist, Formal notice, Numbered facts / Report review card, and Status card. **Customise this sample** copies the selected wording into the editor; only saved selected templates are submitted.

**Scheduled site fleet bundles always use `consolidatedRequestReport`, even when only one named report is selected.** Scheduled CRM site bundles use `consolidatedTicketReport`. Named single-report choices remain available for legacy/manual single-report use, with `inherit` resolving to the consolidated style and approval; they do not select the scheduled site-bundle purpose or create per-event report delivery. Manual report sends use the separate `manualReports` purpose. Existing standard/compact/structured wording and provider names remain compatible.

If the provider explicitly rejects an unavailable CRM template (132001), a single-site delivery can fall back to one PDF attachment with its links, while a multi-site delivery falls back to one text message containing all site links. Timeouts, suspensions and policy pauses do not trigger an additional send. Scheduled fleet template failures are recorded for retry rather than becoming per-request text reports. Provider delivery can still fail; inspect **WhatsApp alert history** and the provider connection/approval state.

### Implementation and focused verification

- `whatsapp-recipient-policy.mjs`, `whatsapp-workflow-policy.mjs`, `whatsapp-report-settings.mjs`: common classification, hard exclusions, same-site request routing, switches and version-2 migration.
- `hierarchy-report-flow.mjs`, `report-delivery-window.mjs`: timed-only migration, effective role/personal schedules and previous-occurrence windows. `server.mjs` connects `reportScheduleScope()`, `crmReportGroups()`, `combineReportWindowGroups()`, generic alert routing and the scheduled senders.
- `site-consolidated-report.mjs`, `table-export-pdf.mjs`, `director-report-bundle.mjs`: complete window activity, site notices, PDF sections and XLSX sheets; server publishing creates the expiring links.
- `src/main.jsx`, `src/whatsapp-report-settings.jsx` / `.css`: the Reports settings entry, role-default and personal editors, reset behaviour and Hierarchy Master access-only editing.
- `whatsapp-report-settings-api.mjs`, `whatsapp-template-catalog.mjs`, `whatsapp-template-runtime.mjs`, `meta-whatsapp.mjs`: authorisation/revisions, wording/preview, provider approvals and transport-level policy checks.

Relevant tests include `whatsapp-workflow-policy`, `generic-whatsapp-alerts`, `whatsapp-report-settings`, `whatsapp-report-settings-api`, `hierarchy-report-flow`, `hierarchy-event-delivery`, `user-report-schedules`, `hierarchy-report-scope`, `site-consolidated-report`, `whatsapp-report-delivery`, `table-bundle-pdf`, `xlsx-report-bundle`, `whatsapp-delivery-settings-ui`, `admin-menu-access` and `hierarchy-master-ui` under `test/` (`.test.mjs`). Keep coverage for legacy routing migration without timing/template resets, hard manager/director exclusions, private CRM alerts, cross-row adjacent windows, opened-and-closed-in-one-window cases, personal CRM override isolation, site-specific files, administrator personal scope, provider approval fallback and pauses during media upload.


### WhatsApp message layout and template rollout (September 2026)

Operational WhatsApp templates begin with a bold `SITE` heading on its own line. Each template has separate labelled fields so provider parameter whitespace normalization cannot collapse the entire message. The saved request or ticket supplies the equipment, breakdown category, complaint, repair work, delay/idle reason, CRM priority/resolution, timestamps, meter and first-trip status as applicable. Individual notifications and reminders omit the Next step field. Audio-only details point users to the recording in Nerve Center; long prose is summarized, with the request link retained.

Scheduled fleet and CRM reports pass structured site, reporting window, activity count and PDF/Excel links. Each scheduled delivery consolidates all selected permitted locations into one message while retaining site-specific files and the exact interval. Manual reports and WhatsApp share text also lead with the site or an explicit multi-site scope. Account password-reset OTPs retain their authentication format.

Manage wording in **Reports → WhatsApp delivery settings → Message templates**. All prepared styles retain the bold site header; new custom wording must retain that header and every required field. Saved older custom bodies remain available for editing and fall back to the new standard until corrected and approved. Changing layouts does not change recipients, pauses, personal schedules or report permissions.

New provider definitions use immutable `*_site_v3` names for individual notifications and `*_locations_v3` names for consolidated reports. Version-2 structured parameters are translated by field name, removing Notes and Next step without shifting retained fields. The original opened-request call and the new layout both contain nine values; callers supplying already-formatted v3 values must set `context.parameterLayout` to `current`. Startup submits missing standard templates and records the provider statuses; a 15-minute read refresh keeps those statuses current. Existing provider definitions remain unchanged. If Meta explicitly reports a new template unavailable (132001), the sender can use the previous approved template with its original parameter contract until the new layout is accepted. Network errors, provider suspensions and application delivery pauses do not trigger that migration retry. Preview availability is separate from provider approval and delivery history should be checked for actual sends.
