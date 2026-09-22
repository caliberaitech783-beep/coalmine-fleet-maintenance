#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_WEBAPP_NAME:?AZURE_WEBAPP_NAME is required}"
: "${AZURE_FRONT_DOOR_PROFILE:?AZURE_FRONT_DOOR_PROFILE is required}"
: "${LIVE_URL:?LIVE_URL is required}"

# Keep production warm and use HTTP/2 at the App Service boundary. The staging
# slot receives the same runtime setting so swap behavior remains predictable.
az webapp config set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_WEBAPP_NAME" \
  --always-on true \
  --http20-enabled true \
  --output none
az webapp config set \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_WEBAPP_NAME" \
  --slot staging \
  --always-on true \
  --http20-enabled true \
  --output none

# Keep the dedicated static route out of traffic. In this environment Azure
# Front Door accepts the route but stalls browser Accept-Encoding requests
# before returning any response bytes. The enabled /* route remains the proven
# delivery path and does not cache authenticated API responses.
endpoint_id="$(az afd endpoint list \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --profile-name "$AZURE_FRONT_DOOR_PROFILE" \
  --query '[0].id' --output tsv)"
test -n "$endpoint_id"

profile_id="$(az afd profile show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --profile-name "$AZURE_FRONT_DOOR_PROFILE" \
  --query id --output tsv)"
live_host="$(LIVE_URL="$LIVE_URL" node -e 'process.stdout.write(new URL(process.env.LIVE_URL).hostname.toLowerCase())')"
custom_domains_json="$(az rest --method get --url "${profile_id}/customDomains?api-version=2024-09-01")"
live_domain_id="$(jq -r --arg host "$live_host" '
  [.value[] | select(((.properties.hostName // "") | ascii_downcase) == $host)][0].id // empty
' <<<"$custom_domains_json")"
if [[ -z "$live_domain_id" ]]; then
  echo "No Azure Front Door custom domain was found for ${live_host}." >&2
  exit 1
fi

routes_json="$(az rest --method get --url "${endpoint_id}/routes?api-version=2024-09-01")"
source_route="$(jq -c --arg live_domain_id "$live_domain_id" '
  [.value[]
    | select(.name != "static-assets")
    | select(.properties.enabledState == "Enabled")
    | select(.properties.patternsToMatch | index("/*"))
    | select(any(.properties.customDomains[]?; ((.id // "") | ascii_downcase) == ($live_domain_id | ascii_downcase)))][0]
' <<<"$routes_json")"
if [[ -z "$source_route" || "$source_route" == "null" ]]; then
  echo "No enabled Azure Front Door /* route attached to ${live_host} was found to clone." >&2
  exit 1
fi

route_body="$(jq -n --argjson source "$source_route" '
  {properties: {
    customDomains: ($source.properties.customDomains // []),
    enabledState: "Disabled",
    forwardingProtocol: $source.properties.forwardingProtocol,
    httpsRedirect: $source.properties.httpsRedirect,
    linkToDefaultDomain: $source.properties.linkToDefaultDomain,
    originGroup: $source.properties.originGroup,
    originPath: $source.properties.originPath,
    patternsToMatch: ["/assets/*"],
    ruleSets: ($source.properties.ruleSets // []),
    supportedProtocols: $source.properties.supportedProtocols
  }}
  | .properties |= with_entries(select(.value != null))
')"

route_update_output=""
if ! route_update_output="$(az rest \
  --method put \
  --url "${endpoint_id}/routes/static-assets?api-version=2024-09-01" \
  --headers 'Content-Type=application/json' \
  --body "$route_body" \
  --output none 2>&1)"; then
  printf '%s\n' "$route_update_output" >&2
  exit 1
fi

configured_route="$(az rest --method get --url "${endpoint_id}/routes/static-assets?api-version=2024-09-01")"
jq -e --arg live_domain_id "$live_domain_id" '
  .properties.enabledState == "Disabled"
  and .properties.patternsToMatch == ["/assets/*"]
  and any(.properties.customDomains[]?; ((.id // "") | ascii_downcase) == ($live_domain_id | ascii_downcase))
' <<<"$configured_route" >/dev/null

echo "Azure performance configuration verified: Always On, HTTP/2, and unsafe /assets/* route disabled."
