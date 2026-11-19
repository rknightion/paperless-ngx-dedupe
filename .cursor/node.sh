#!/usr/bin/env bash
set -euo pipefail

node_version=$(sed -nE 's/^FROM node:([0-9]+\.[0-9]+\.[0-9]+)-.*/\1/p' Dockerfile | sed -n '1p')
# The checksums match the Node release used in the production Dockerfile.
case "$node_version:$(uname -m)" in
    26.13.1:x86_64)
        node_arch=x64
        node_sha=5c063e46bab0fbc1c17cc445d7ff129cbdcd0471be6ed83b6ab864f8143bc864
        ;;
    26.13.1:aarch64)
        node_arch=arm64
        node_sha=89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd
        ;;
    *) printf 'No archive checksum for Node %s on %s\n' "$node_version" "$(uname -m)" >&2; exit 1 ;;
esac

pnpm_spec=$(node -p "require('./package.json').packageManager")
if [[ ! $pnpm_spec =~ ^pnpm@[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'Expected a pinned pnpm version in package.json\n' >&2
    exit 1
fi

tool_cache="${XDG_CACHE_HOME:-$HOME/.cache}/paperless-dedupe"
node_home="$tool_cache/node-$node_version"
pnpm_home="$tool_cache/$pnpm_spec"
export PATH="$node_home/bin:$pnpm_home/bin:$PATH"

install_tools() (
    flock 9
    if [[ -x "$node_home/bin/node" && -x "$pnpm_home/bin/pnpm" ]]; then
        exit 0
    fi
    scratch=$(mktemp -d "$tool_cache/download.XXXXXX")
    trap 'rm -rf -- "$scratch"' EXIT

    if [[ ! -x "$node_home/bin/node" ]]; then
        archive="node-v$node_version-linux-$node_arch.tar.xz"
        curl -q -fsSL --proto '=https' --proto-redir '=https' --retry 3 \
            "https://nodejs.org/dist/v$node_version/$archive" -o "$scratch/$archive"
        printf '%s  %s\n' "$node_sha" "$scratch/$archive" | sha256sum --check
        mkdir "$scratch/node"
        tar -xJf "$scratch/$archive" -C "$scratch/node" --strip-components=1
        mv -T "$scratch/node" "$node_home"
    fi

    if [[ ! -x "$pnpm_home/bin/pnpm" ]]; then
        npm install --global --prefix "$scratch/pnpm" --ignore-scripts --no-audit --no-fund "$pnpm_spec"
        mv -T "$scratch/pnpm" "$pnpm_home"
    fi
) 9>"$tool_cache/install.lock"

case "${1:-}" in
    bootstrap)
        mkdir -p "$tool_cache"
        install_tools
        npm_config_nodedir="$node_home" exec env -u FARO_SOURCEMAP_API_KEY just setup build
        ;;
    preview)
        exec env -i PATH="$PATH" NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
            DATABASE_URL=:memory: PAPERLESS_READ_ONLY=true PAPERLESS_URL=http://127.0.0.1:9 \
            PAPERLESS_API_TOKEN=test-token node packages/web/build/index.js
        ;;
    *) exec "$@" ;;
esac
