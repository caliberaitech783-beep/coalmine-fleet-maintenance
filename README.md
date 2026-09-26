# coalmine-fleet-maintenance
Nerve Center breakdown management dashboard

## Project guide

See [PROJECT_WORKFLOW.md](PROJECT_WORKFLOW.md) for the application architecture, login and role flow, master-data behavior, request lifecycle, API reference, PostgreSQL model, and Azure CI/CD process.

## Object storage for uploaded media

Images, videos, and trip-card PDFs use signed direct uploads. The browser uploads the raw file to private Azure Blob Storage or an S3-compatible bucket; PostgreSQL stores only the object key and metadata. Existing Base64 database media remains readable until it is migrated.

For the Azure App Service deployment, set these application settings on both the production and staging slots:

```text
MEDIA_STORAGE_PROVIDER=azure
AZURE_STORAGE_CONNECTION_STRING=<storage-account-connection-string>
AZURE_STORAGE_CONTAINER=nerve-center-media
```

Keep the container private. Configure Blob-service CORS for the application origin (`https://bdms.cmll.in`, plus the staging origin) with `PUT`, `GET`, `HEAD`, and `OPTIONS`; allow the `Content-Type` and `x-ms-blob-type` request headers. Never expose the connection string to the browser—the API creates one-hour, object-scoped signed URLs.

For a non-Azure deployment, set `MEDIA_STORAGE_PROVIDER=s3` plus `S3_BUCKET`, `S3_REGION`, and credentials. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` support providers such as MinIO. The bucket also needs browser CORS for `PUT`, `GET`, and `HEAD` from the application origin.

After deploying once so the metadata columns exist, move legacy database payloads with:

```powershell
npm run media:migrate
```

The migration uploads each object before clearing its legacy database field. Unreferenced uploads older than 24 hours are removed automatically by the production background job.

## Privileged account provisioning

Startup does not create or recreate a default privileged login. Provision accounts explicitly through an authorized administrator; a new empty database requires a separately approved initial-account setup. This policy does not delete existing accounts, change passwords, or revoke sessions. The owner must review existing privileged accounts and rotate any previously shared or default credentials separately.
