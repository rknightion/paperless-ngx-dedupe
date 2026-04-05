#!/usr/bin/env bash
# Bulk-create tags in Paperless-NGX from a comma-separated list.
# Each tag is created with matching_algorithm=0 (None) so Paperless
# won't auto-assign it to documents.
set -euo pipefail

# Replace these with your own Paperless-NGX instance URL and API token. Yeah, I inadvertedly committed mine to git but dw they're long since rotated :)
PAPERLESS_URL="https://paperless.rob-knight.net"
PAPERLESS_TOKEN="1b0da29518f40d117070765c0df588049a7c0073"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <tag1,tag2,tag3,...>" >&2
  echo "Examples:" >&2
  echo "  $0 accommodation,airport,billing" >&2
  echo "  $0 \"cloud-services,change-of-address\"" >&2
  exit 1
fi

# Join all args and split on commas
IFS=',' read -ra tags <<< "$*"

for raw_tag in "${tags[@]}"; do
  # Trim leading/trailing whitespace
  name=$(echo "$raw_tag" | xargs)
  [ -z "$name" ] && continue

  response=$(curl -s -w "\n%{http_code}" \
    -X POST "${PAPERLESS_URL}/api/tags/" \
    -H "Authorization: Token ${PAPERLESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${name}\", \"matching_algorithm\": 0}")

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "OK: ${name}"
  else
    echo "FAIL (${http_code}): ${name} — ${body}" >&2
  fi
done
