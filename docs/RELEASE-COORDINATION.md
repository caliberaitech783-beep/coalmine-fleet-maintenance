# Coordinated production releases

This procedure supports five developers. It changes publishing, not the UI, application business rules, database schema or production records.

## Ownership and operation

- Only `.github/workflows/production-release.yml` on `azure-hosting-1.0` publishes. Both older workflow IDs must be disabled globally at cutover because old branches can contain their old definitions.
- Pull requests run the complete test suite with an ephemeral PostgreSQL service and build a package, with no Azure credentials or deployment. The team reviews and merges changes into the single release branch. Branch protection is a separate repository-admin setting; this change does not claim to enable it.
- Every production-branch push is evaluated against the healthy live commit. There are no push path filters that could lose a previously queued backend change. Tests/docs/workflow-only deltas run checks without releasing; unknown runtime files and changes to the runtime packager take the backend lane.
- Builds/tests run outside the production lock. The deployment job uses the existing `coalmine-fleet-production` group and never cancels an active release. Pending runs are retained by GitHub, then checked for supersession after acquiring the lock. A newer cumulative branch head supersedes older candidates; if the newest candidate fails tests, production stays unchanged until corrected.
- Before any Azure mutation, the candidate must contain the healthy live commit and match the production-branch head. Already-published, older or superseded candidates skip; unrelated/divergent history fails. The live baseline is rechecked immediately before UI publishing or a staged swap.
- UI-only deltas may use the direct ZIP lane only when a retained artifact from a successful recognised production workflow exactly matches the current healthy live commit. Artifact digest and embedded commit are checked before Azure access. Missing/expired/inaccessible rollback metadata routes to staging; download or identity errors stop safely.
- Backend releases retain staging health checks, disabled scheduled jobs, swap and exact-commit rollback. Successful ZIP deployment already restarts the slot; the extra unconditional restart is removed. Retry recovery restarts remain. Staging is still stopped after use; keeping it warm is not part of this change.
- Packages are built once. They contain runtime modules, built frontend, report assets and the existing dependency graph; UI source, tests, docs, workflow files and local environment files are excluded. Dependency pruning and true independent static frontend releases are deferred.
- Health verification checks the exact commit, database connectivity, scheduler state and a referenced browser JavaScript asset. Front Door-only origin checks are retained. No database cleanup or record mutation is performed by this pipeline.

## Manual operation

Run the coordinated workflow from the production branch. `validate_only` defaults to true. To publish an explicitly requested infrastructure/package validation release with no application delta, set `validate_only=false` and `force_deploy=true`; this always uses staging. For ordinary pushes, runtime changes release automatically after passing checks.

`report_source_sha`, if used, must identify the current canonical branch revision and the complete live-to-target delta must contain only `department-reports.mjs` and its test. It cannot bypass ancestry checks or replace parallel work.

## Safe cutover

1. Validate the change in a pull request, including isolated PostgreSQL tests and package construction.
2. Confirm no active legacy production run is mid-deployment. Let it finish; do not cancel it.
3. Disable GitHub workflow IDs 332574953 (old full release) and 348288825 (old UI release) using the normal repository workflow controls. Do not modify unrelated inspection workflows or their permissions.
4. Merge/fast-forward only the reviewed cumulative revision onto `azure-hosting-1.0`. Confirm the new workflow validates successfully and no legacy writer remains enabled.
5. The new runtime packager makes the initial release a staged backend release automatically. Validate the new package end-to-end and record the exact live commit and timings. No synthetic production records are needed.
6. If cutover fails, report the failure. Re-enable the previous release workflow only after ensuring the coordinated writer cannot race it; do not roll back application code or data casually.

## Limits

Coordination cannot remove Azure upload/startup/swap time. Direct UI deployment still restarts the backend in phase one. An unhealthy or unidentifiable live baseline blocks automatic release rather than guessing. A person with direct Azure access can bypass GitHub serialization, so team discipline and access governance are still necessary. This change does not configure new infrastructure, branch protection or five preview databases.
