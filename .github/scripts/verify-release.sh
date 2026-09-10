#!/usr/bin/env bash
set -euo pipefail
url="$1"
expected_sha="$2"
jobs_enabled="$3"
attempts="${4:-24}"
for ((attempt=1; attempt<=attempts; attempt++)); do
  if response="$(curl --fail --silent --show-error --max-time 20 "${url}/api/health?release=${expected_sha}&attempt=${attempt}")" &&
    HEALTH_RESPONSE="$response" EXPECTED_COMMIT="$expected_sha" JOBS_ENABLED="$jobs_enabled" node -e 'const h=JSON.parse(process.env.HEALTH_RESPONSE);if(h.status!=="ok"||h.database!=="connected"||h.commit!==process.env.EXPECTED_COMMIT||h.scheduledJobsEnabled!==(process.env.JOBS_ENABLED==="true"))process.exit(1)'; then
    if page="$(curl --fail --silent --show-error --max-time 20 "${url}/?release=${expected_sha}")"; then
      asset="$(printf '%s' "$page" | grep -oE 'src="/assets/[^" ]+\.js"' | head -1 | cut -d'"' -f2 || true)"
      if [ -n "$asset" ] && curl --fail --silent --show-error --max-time 20 --output /dev/null "${url}${asset}"; then
        echo "Healthy release ${expected_sha}; database, scheduler state, and browser asset verified."
        exit 0
      fi
    fi
  fi
  if [ "$attempt" -lt "$attempts" ]; then sleep 5; fi
done
echo "Release health verification failed for ${expected_sha}"
exit 1
