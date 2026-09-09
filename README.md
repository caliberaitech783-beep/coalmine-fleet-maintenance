# coalmine-fleet-maintenance
Nerve Center breakdown management dashboard

## Project guide

See [PROJECT_WORKFLOW.md](PROJECT_WORKFLOW.md) for the application architecture, login and role flow, master-data behavior, request lifecycle, API reference, PostgreSQL model, and Azure CI/CD process.

## Privileged account provisioning

Startup does not create or recreate a default privileged login. Provision accounts explicitly through an authorized administrator; a new empty database requires a separately approved initial-account setup. This policy does not delete existing accounts, change passwords, or revoke sessions. The owner must review existing privileged accounts and rotate any previously shared or default credentials separately.
