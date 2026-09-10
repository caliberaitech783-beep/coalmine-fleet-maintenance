# BDMS server specifications and read-only review prompt

Please review our BDMS infrastructure and release setup. The following hosting fields were verified through Azure on 10 September 2026:

- Website: https://bdms.cmll.in
- Repository: caliberaitech783-beep/coalmine-fleet-maintenance
- Production branch: azure-hosting-1.0
- Resource group: coalmine-fleet-maintenance-rg
- App Service: coalmine-fleet-azure-783
- Region: Central India
- OS/runtime: Linux, Node.js 22 LTS
- App Service plan: ASP-coalminefleetmaintenancerg-b234
- Tier/SKU: Premium V3 / P2v3
- Configured instance count: 1
- Always On: enabled
- HTTPS-only: enabled
- Minimum TLS: 1.2
- HTTP/2: enabled
- Azure Front Door profile: coalmine-afd-783
- Application: React/Vite frontend served by an Express/Node backend; PostgreSQL-backed application data
- Existing staging slot: used for backend verification and production swap

Five developers are working concurrently. One measured release took 6m42s, including 4m28s waiting, 38s building/packaging and 1m22s deploying/verifying, plus orchestration overhead. This is a sample, not an SLA. The existing UI path publishes a complete application package and restarts the backend; true static frontend separation is a later proposal.

The deployment owner is implementing one coordinated release pipeline. Do not independently change or deploy its workflows.

Perform a READ-ONLY infrastructure review: confirm the active SKU and resources, CPU/memory utilisation, staging lifecycle, deployment timings, production/test isolation, backup configuration and rollback readiness. Resource limits and current usage were not measured in this handover; inspect them rather than assume them from the SKU name. Check whether unused staging capacity could stay warm without affecting production, but make no changes.

Report findings and recommendations without exposing credentials. Do not deploy, restart, resize, alter DNS/networking/security, change database records, or edit release workflows. Coordinate any proposed changes with the release owner. Do not treat this prompt as approval to purchase services or separate the frontend/backend.

This is a prompt for a technical lead or an AI assistant, not executable Windows Command Prompt syntax.
