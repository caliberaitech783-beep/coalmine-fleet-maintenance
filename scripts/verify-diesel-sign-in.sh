#!/usr/bin/env bash
set -euo pipefail

sign_in_ready() {
  local proof status
  proof="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
  status="$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
    "${LIVE_URL}/api/diesel-sso/authorize?state=${proof}&code_challenge=${proof}")" || return 1
  [[ "$status" == 303 ]]
}

if sign_in_ready; then
  echo "Pulse can start a Diesel sign-in."
  exit 0
fi

# Keep app setting values out of CI logs and artifacts.
fleet=(--resource-group "$AZURE_RESOURCE_GROUP" --name "$AZURE_WEBAPP_NAME")
if ! settings="$(az webapp config appsettings list "${fleet[@]}" \
  --query "[?name=='DIESEL_SSO_ENABLED' || name=='DIESEL_SSO_CLIENT_SECRET']" --output json --only-show-errors)"; then
  echo "::error::Azure denied access to the Pulse sign-in configuration."
  exit 1
fi
secret="$(jq -r 'map(select(.name=="DIESEL_SSO_CLIENT_SECRET"))[0].value // ""' <<<"$settings")"
enabled="$(jq -r 'map(select(.name=="DIESEL_SSO_ENABLED"))[0].value // ""' <<<"$settings")"
unset settings

if ! [[ "$secret" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
  echo "Pulse is missing a valid Diesel sign-in secret. Checking the Diesel app setting."
  if ! secret="$(az webapp config appsettings list --resource-group caliber-diesel-rg \
    --name caliber-diesel-783 --query "[?name=='DIESEL_SSO_CLIENT_SECRET'].value | [0]" \
    --output tsv --only-show-errors)"; then
    echo "::error::The deployment identity cannot read the Diesel app setting required to configure Pulse."
    exit 1
  fi
  if ! [[ "$secret" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
    echo "::error::The Diesel app does not expose a valid shared sign-in secret in its settings."
    exit 1
  fi
  umask 077
  repair_file="$(mktemp)"
  trap 'rm -f "$repair_file"' EXIT
  printf '{"DIESEL_SSO_CLIENT_SECRET":"%s","DIESEL_SSO_ENABLED":"1"}\n' "$secret" >"$repair_file"
  az webapp config appsettings set "${fleet[@]}" --slot-settings "@$repair_file" --output none --only-show-errors
elif [[ "$enabled" != 1 ]]; then
  echo "Enabling Diesel sign-in on Pulse production."
  az webapp config appsettings set "${fleet[@]}" --slot-settings DIESEL_SSO_ENABLED=1 --output none --only-show-errors
else
  echo "Pulse already has the required setting formats. Checking endpoint readiness after startup."
fi
unset secret

for attempt in {1..15}; do
  if sign_in_ready; then
    echo "Pulse can start a Diesel sign-in."
    exit 0
  fi
  sleep 5
done
echo "::error::Pulse still cannot start a Diesel sign-in. Check Azure startup logs for Diesel sign-in initialization errors."
exit 1
