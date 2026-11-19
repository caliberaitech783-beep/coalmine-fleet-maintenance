#!/usr/bin/env bash
# Keeps the two Diesel sign-in settings on both slots as deployment slot settings, so a slot swap
# cannot leave production without them. Values are never printed, logged or written to an artifact.
set -euo pipefail

fleet=(--resource-group "$AZURE_RESOURCE_GROUP" --name "$AZURE_WEBAPP_NAME")
names="[?name=='DIESEL_SSO_CLIENT_SECRET' || name=='DIESEL_SSO_ENABLED']"
valid='^[A-Za-z0-9_-]{43}$'

read_slot() { az webapp config appsettings list "${fleet[@]}" "$@" --query "$names" --output json --only-show-errors; }
value() { jq -r --arg name "$2" 'map(select(.name==$name))[0].value // ""' <<<"$1"; }
# Pinned means both settings are present as deployment slot settings.
pinned() { [[ "$(jq '[.[]|select(.slotSetting==true)]|length' <<<"$1")" == 2 ]]; }

production="$(read_slot)"
staging="$(read_slot --slot staging)"
secret="$(value "$production" DIESEL_SSO_CLIENT_SECRET)"
source_slot=production
if ! [[ "$secret" =~ $valid ]]; then
  secret="$(value "$staging" DIESEL_SSO_CLIENT_SECRET)"
  source_slot=staging
fi
if ! [[ "$secret" =~ $valid ]]; then
  echo "::warning::Neither slot holds a valid Diesel sign-in secret, so there is nothing to pin."
  exit 0
fi
echo "Using the Diesel sign-in secret held by the ${source_slot} slot."

umask 077
settings_file="$(mktemp)"
trap 'rm -f "$settings_file"' EXIT
jq -n --arg secret "$secret" '{DIESEL_SSO_CLIENT_SECRET:$secret,DIESEL_SSO_ENABLED:"1"}' >"$settings_file"

ready() { [[ "$(value "$1" DIESEL_SSO_CLIENT_SECRET)" == "$secret" && "$(value "$1" DIESEL_SSO_ENABLED)" == 1 ]] && pinned "$1"; }

if ready "$staging"; then
  echo "Staging already holds the pinned Diesel sign-in settings."
else
  az webapp config appsettings set "${fleet[@]}" --slot staging --slot-settings "@$settings_file" --output none --only-show-errors
  echo "Pinned the Diesel sign-in settings on staging."
fi

if ready "$production"; then
  echo "Production already holds the pinned Diesel sign-in settings."
else
  # Saving app settings restarts production once; later deploys find them in place and skip this.
  az webapp config appsettings set "${fleet[@]}" --slot-settings "@$settings_file" --output none --only-show-errors
  echo "Pinned the Diesel sign-in settings on production. Waiting for production to answer again."
  for attempt in {1..36}; do
    if response="$(curl --fail --silent --show-error --max-time 20 "${LIVE_URL}/api/health?diesel-settings=1")" && \
      HEALTH_RESPONSE="$response" node -e "const h=JSON.parse(process.env.HEALTH_RESPONSE); if(h.status!=='ok'||h.database!=='connected') process.exit(1)"; then
      echo "Production is healthy after the settings change."
      break
    fi
    if [ "$attempt" -eq 36 ]; then
      echo "::error::Production did not report healthy after the Diesel settings change."
      exit 1
    fi
    sleep 5
  done
fi
unset secret production staging
