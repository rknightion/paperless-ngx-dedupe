#!/usr/bin/env bash
# Bulk-create correspondents in Paperless-NGX.
# Each correspondent is created with matching_algorithm=0 (None) so Paperless
# won't auto-assign it to documents.
set -euo pipefail

: "${PAPERLESS_URL:?set PAPERLESS_URL}"
: "${PAPERLESS_API_TOKEN:?set PAPERLESS_API_TOKEN}"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <name words> [-- <name words> ...]" >&2
  echo "Examples:" >&2
  echo "  $0 City Council              # creates \"City Council\"" >&2
  echo "  $0 City Council -- Acme Corp # creates two correspondents" >&2
  exit 1
fi

# Split args on "--" to get individual names, joining words within each group
names=()
current=()
for arg in "$@"; do
  if [ "$arg" = "--" ]; then
    if [ ${#current[@]} -gt 0 ]; then
      names+=("${current[*]}")
      current=()
    fi
  else
    current+=("$arg")
  fi
done
if [ ${#current[@]} -gt 0 ]; then
  names+=("${current[*]}")
fi

for name in "${names[@]}"; do
  payload=$(jq -n --arg name "$name" '{name: $name, matching_algorithm: 0}')
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "${PAPERLESS_URL}/api/correspondents/" \
    -H "Authorization: Token ${PAPERLESS_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload")

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo "OK: ${name}"
  else
    echo "FAIL (${http_code}): ${name} — ${body}" >&2
  fi
done
