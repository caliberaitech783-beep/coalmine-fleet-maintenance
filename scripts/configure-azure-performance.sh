#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${AZURE_WEBAPP_NAME:?AZURE_WEBAPP_NAME is required}"
: "${AZURE_FRONT_DOOR_PROFILE:?AZURE_FRONT_DOOR_PROFILE is required}"

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
# route's domains, origin, protocols and rule sets, then narrow it to assets.
endpoint_id="$(az afd endpoint list \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --profile-name "$AZURE_FRONT_DOOR_PROFILE" \
  --query '[0].id' --output tsv)"
test -n "$endpoint_id"

routes_json="$(az rest --method get --url "${endpoint_id}/routes?api-version=2024-09-01")"
source_route="$(jq -c '
  [.value[]
    | select(.name != "static-assets")
    | select(.properties.enabledState == "Enabled")
    | select(.properties.patternsToMatch | index("/*"))][0]
' <<<"$routes_json")"
if [[ -z "$source_route" || "$source_route" == "null" ]]; then
  echo "No enabled Azure Front Door /* route was found to clone." >&2
  exit 1
fi

route_body="$(jq -n --argjson source "$source_route" '
  {properties: {
    cacheConfiguration: {
      compressionSettings: {
        contentTypesToCompress: [
          "text/css", "text/javascript", "application/javascript",
          "application/json", "image/svg+xml", "application/wasm",
          "font/woff", "font/woff2"
        ],
        isCompressionEnabled: true
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

az rest \
  --method put \
  --url "${endpoint_id}/routes/static-assets?api-version=2024-09-01" \
  --headers 'Content-Type=application/json' \
  --body "$route_body" \
  --output none

configured_route="$(az rest --method get --url "${endpoint_id}/routes/static-assets?api-version=2024-09-01")"
jq -e '
  .properties.enabledState == "Enabled"
  and .properties.patternsToMatch == ["/assets/*"]
  and .properties.cacheConfiguration.queryStringCachingBehavior == "IgnoreQueryString"
  and .properties.cacheConfiguration.compressionSettings.isCompressionEnabled == true
' <<<"$configured_route" >/dev/null

echo "Azure performance configuration verified: Always On, HTTP/2, and cached /assets/* route."
