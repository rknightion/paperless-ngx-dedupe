#!/usr/bin/env bash
# CLOUD AGENTS ONLY: local agents must not execute this environment-provisioning script.

set -Eeuo pipefail

readonly NODE_MAJOR=24
readonly PNPM_VERSION=11.18.0
readonly BACKLOG_VERSION=1.50.1

log() {
  printf '\n==> %s\n' "$*"
}

as_root() {
  if [[ ${EUID} -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    printf 'This setup needs root access to install system tools.\n' >&2
    return 1
  fi
}

install_node() {
  if command -v node >/dev/null 2>&1 && [[ $(node --version) == "v${NODE_MAJOR}."* ]]; then
    log "Node.js $(node --version) is already available"
    return
  fi

  local architecture node_arch temporary_directory node_archive
  architecture=$(uname -m)
  case "${architecture}" in
    x86_64) node_arch=x64 ;;
    aarch64 | arm64) node_arch=arm64 ;;
    *)
      printf 'Unsupported architecture for Node.js: %s\n' "${architecture}" >&2
      return 1
      ;;
  esac

  temporary_directory=$(mktemp -d)
  trap 'rm -rf "${temporary_directory}"' RETURN

  log "Installing the latest Node.js ${NODE_MAJOR}.x release"
  curl --fail --location --retry 3 --silent --show-error \
    "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/" -o "${temporary_directory}/index.html"
  node_archive=$(sed -n "s#.*>\(node-v${NODE_MAJOR}[^<]*-linux-${node_arch}\\.tar\\.xz\)</a>.*#\1#p" \
    "${temporary_directory}/index.html" | head -n 1)
  if [[ -z ${node_archive} ]]; then
    printf 'Could not determine the latest Node.js %s archive.\n' "${NODE_MAJOR}" >&2
    return 1
  fi

  curl --fail --location --retry 3 --silent --show-error \
    "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/${node_archive}" \
    -o "${temporary_directory}/${node_archive}"
  curl --fail --location --retry 3 --silent --show-error \
    "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt" \
    -o "${temporary_directory}/SHASUMS256.txt"
  (
    cd "${temporary_directory}"
    grep " ${node_archive}$" SHASUMS256.txt | sha256sum --check --strict -
  )

  as_root tar --extract --xz --file "${temporary_directory}/${node_archive}" \
    --directory /usr/local --strip-components=1
  hash -r
}

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "${repo_root}"

install_node

log "Installing pnpm ${PNPM_VERSION} and Backlog.md ${BACKLOG_VERSION}"
as_root env PATH="${PATH}" npm install --global \
  "pnpm@${PNPM_VERSION}" \
  "backlog.md@${BACKLOG_VERSION}"
hash -r

log 'Installing repository dependencies from the frozen lockfile'
pnpm install --frozen-lockfile

log 'Installing Chromium and its Ubuntu system dependencies for Playwright tests'
for attempt in 1 2 3; do
  if [[ ${attempt} -gt 1 ]]; then
    log "Retrying Playwright install (attempt ${attempt}/3)"
  fi
  if timeout 300 pnpm --filter @paperless-dedupe/web exec playwright install --with-deps chromium; then
    break
  elif [[ ${attempt} -eq 3 ]]; then
    log "Playwright install failed after 3 attempts"
    exit 1
  fi
done

log 'Verifying the cloud task toolchain'
node --version
pnpm --version
backlog --version
pnpm --filter @paperless-dedupe/web exec playwright --version

log 'Cloud environment setup complete'
