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

# Azure recommends a distinct cached route for static files so authenticated
# API responses can never enter the shared edge cache. Clone the active /*
# route attached to the live custom domain (not merely the first endpoint
# route), then narrow that identical domain/origin configuration to assets.
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
    cacheConfiguration: {
      compressionSettings: {
        contentTypesToCompress: [],
        # Front Door compression on this route has returned headers but then
        # stalled browser Accept-Encoding requests before sending any body.
        # API responses still negotiate compression at the origin. Fingerprinted
        # assets are deliberately identity encoded and cached at the edge.
        isCompressionEnabled: false
      },
      queryParameters: "",
      queryStringCachingBehavior: "IgnoreQueryString"
    },
    customDomains: ($source.properties.customDomains // []),
    enabledState: "Enabled",
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
  if grep -q 'AuthorizationFailed' <<<"$route_update_output"; then
    echo "::warning title=Front Door cache permission required::App Service Always On and HTTP/2 were applied, but the deployment identity needs Microsoft.Cdn/profiles/afdEndpoints/routes/write to create the static-assets route. Continuing the application deployment without edge caching."
    exit 0
  fi
  printf '%s\n' "$route_update_output" >&2
  exit 1
fi

configured_route="$(az rest --method get --url "${endpoint_id}/routes/static-assets?api-version=2024-09-01")"
jq -e --arg live_domain_id "$live_domain_id" '
  .properties.enabledState == "Enabled"
  and .properties.patternsToMatch == ["/assets/*"]
  and any(.properties.customDomains[]?; ((.id // "") | ascii_downcase) == ($live_domain_id | ascii_downcase))
  and .properties.cacheConfiguration.queryStringCachingBehavior == "IgnoreQueryString"
  and .properties.cacheConfiguration.compressionSettings.isCompressionEnabled == false
' <<<"$configured_route" >/dev/null

echo "Azure performance configuration verified: Always On, HTTP/2, and cached /assets/* route."
