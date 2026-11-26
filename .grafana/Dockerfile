# Grafana Assistant sandbox image. Vended from rknightion/.github (vended/grafana/Dockerfile);
# edit it there, not here. Docs:
# https://grafana.com/docs/grafana-cloud/platform/grafana-assistant/configure/custom-sandbox-images/
#
# Grafana's base image (Alpine, ARM64, with git, gh, curl, jq, uv and Python) plus every
# toolchain the fleet uses: pinned toolchains from the shared image, the rest from Alpine.
# Each repository's own gate tools (golangci-lint, zizmor, ...) are installed by its
# justfile on first use, at the versions it pins.
ARG GRAFANA_BASE_IMAGE
FROM ghcr.io/rknightion/assistant-sandbox-tools:main@sha256:efdfc3796ef1f3e270c8078d33990be86ebbbc871dc663e424f5a4307ee50f8d AS tools

FROM ${GRAFANA_BASE_IMAGE}
# Unpinned on purpose: Alpine versions follow whichever release Grafana's base image uses, and pnpm
# switches itself to the version a repository's packageManager field names.
# hadolint ignore=DL3016,DL3018
RUN apk add --no-cache bash build-base coreutils findutils just nodejs-current npm shellcheck sqlite unzip xz \
    && npm install --global --no-fund --no-audit pnpm \
    && git config --system --add safe.directory '*'
COPY --from=tools /opt/sandbox /opt/sandbox
ENV PATH=/opt/sandbox/go/bin:/opt/sandbox/bin:$PATH \
    UV_PYTHON_INSTALL_DIR=/opt/sandbox/python \
    UV_LINK_MODE=copy \
    GOTOOLCHAIN=auto
RUN go version && helm version --short && tofu version && terraform version && kubectl version --client \
    && actionlint --version && tflint --version && just --version && node --version && pnpm --version \
    && uv python find 3.15
