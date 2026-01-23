#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_SPEC="$(mktemp)"

cleanup() {
  rm -f "$TMP_SPEC"
}
trap cleanup EXIT

uv run python - <<'PY' > "$TMP_SPEC"
from paperless_dedupe.main import app
import json

print(json.dumps(app.openapi(), indent=2))
PY

npx openapi-typescript "$TMP_SPEC" -o "$ROOT_DIR/frontend/src/services/api/generated.ts"
