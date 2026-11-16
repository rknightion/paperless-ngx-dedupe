#!/usr/bin/env bash
set -euo pipefail

image=${1:-paperless-ngx-dedupe:local}
container_name="paperless-worker-check-$$-$RANDOM"
container_started=false

for tool in docker curl jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required tool is missing: $tool" >&2
    exit 1
  fi
done

cleanup() {
  local status=$?
  if "$container_started"; then
    if (( status != 0 )); then
      docker logs "$container_name" >&2 || true
    fi
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Keep this list in sync with WorkerName in packages/core/src/jobs/worker-paths.ts.
docker run --rm --entrypoint node "$image" -e '
  const fs = require("node:fs");
  const workers = [
    "sync-worker", "analysis-worker", "batch-worker", "restore-worker", "ai-processing-worker",
    "ai-apply-worker", "ai-revert-worker", "custom-field-discovery-worker"
  ];
  const missing = workers
    .map(name => "/app/node_modules/@paperless-dedupe/core/dist/jobs/workers/" + name + ".js")
    .filter(path => !fs.existsSync(path));
  for (const path of missing) console.error("Worker script not found: " + path);
  process.exitCode = missing.length ? 1 : 0;
'

# Set this before docker run so cleanup also handles a failed container start.
container_started=true
docker run -d --name "$container_name" \
  -e PAPERLESS_URL=http://127.0.0.1:9 \
  -e PAPERLESS_API_TOKEN=test-token \
  -p 127.0.0.1:3000:3000 "$image" >/dev/null

healthy=false
deadline=$((SECONDS + 60))
while (( SECONDS < deadline )); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$container_name")
  if [[ "$status" == healthy ]]; then
    healthy=true
    break
  fi
  sleep 1
done
if ! "$healthy"; then
  echo 'Container failed to become healthy within 60 seconds' >&2
  exit 1
fi

response=$(curl --noproxy '*' --silent --show-error --max-time 10 \
  --write-out $'\n%{http_code}' \
  -H 'Content-Type: application/json' --data '{}' http://127.0.0.1:3000/api/v1/sync)
http_status=${response##*$'\n'}
body=${response%$'\n'*}
if [[ "$http_status" != 202 ]]; then
  printf 'Expected HTTP 202 from sync, received %s\n%s\n' "$http_status" "$body" >&2
  exit 1
fi
job_id=$(jq -er '.data.jobId | select(type == "string" and test("^[A-Za-z0-9_-]+$"))' <<< "$body")

deadline=$((SECONDS + 60))
job_json=''
while (( SECONDS < deadline )); do
  job_json=$(curl --noproxy '*' --fail --silent --show-error --max-time 10 \
    "http://127.0.0.1:3000/api/v1/jobs/$job_id")
  status=$(jq -er '.data.status | select(type == "string")' <<< "$job_json")
  if [[ "$status" == failed || "$status" == completed ]]; then
    printf '%s\n' "$job_json"
    if [[ "$status" == failed ]] && jq -e \
      '(.data.errorMessage // "") | test("Worker script not found|Cannot find module|ERR_MODULE_NOT_FOUND"; "i")' \
      >/dev/null <<< "$job_json"; then
      echo 'Worker launch or module resolution failed' >&2
      exit 1
    fi
    echo "Image worker check passed: sync reached $status"
    exit 0
  fi
  sleep 1
done
printf 'Sync job did not finish within 60 seconds\n%s\n' "$job_json" >&2
exit 1
