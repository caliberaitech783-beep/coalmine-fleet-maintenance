# Prompt for the five-person BDMS development team

We are coordinating BDMS releases so five people can develop without overwriting one another or creating unnecessary Azure deployments.

Repository: caliberaitech783-beep/coalmine-fleet-maintenance

Production website: https://bdms.cmll.in

Single production branch: azure-hosting-1.0

1. Each person must use a separate feature branch and working folder. Do not switch branches in somebody else's shared working folder. Preserve all existing changes; never force-push or reset shared work.
2. Submit work for review into azure-hosting-1.0. Resolve overlapping changes and pass the Build and test check before merging. This is a team procedure; do not assume branch protection has been enabled automatically.
3. Production publishing belongs to the coordinated GitHub workflow, production-release.yml. Do not deploy directly to Azure, use a different branch to publish, edit deployment workflows independently, or cancel an active deployment. Coordinate emergency exceptions with the release owner.
4. Builds and tests run in parallel. Only updates to shared staging/production are serialized. A newer tested cumulative version can include multiple people's approved changes. An old pending release can be skipped, but nobody's merged code may be discarded.
5. Release classification must compare the complete proposed version with the healthy live version. A UI commit following an undeployed backend commit still requires the staged backend lane.
6. Database records, permissions, business rules, security controls and website structure are not to be changed as part of deployment optimisation. Tests must use an isolated test database.
7. During cutover, continue development but coordinate production merges with the release owner until the new pipeline is confirmed active. The release owner must disable both legacy GitHub workflow IDs, not just edit their files on one branch.

When handing over work, state what changed, tests run, branch/commit, affected files and any migration or compatibility requirements. Never include passwords, tokens or database connection strings.
