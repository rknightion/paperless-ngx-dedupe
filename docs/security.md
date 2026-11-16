---
title: Security
description: What Paperless NGX Dedupe reads and writes, where document text goes, credential scope, and how to report a vulnerability.
---

# Security

This page covers what data Paperless NGX Dedupe touches, where it can send document content,
what its Paperless-NGX credential needs, and where secrets live.

!!! warning "Early development"
    Paperless NGX Dedupe is not production-ready. Do not point it at a Paperless-NGX instance
    you care about without a backup — see [Getting Started](getting-started.md).

## Access model

Access protection is off by default (`APP_AUTH_MODE=none`). Anyone who can reach the port can
use the UI and API with the Paperless-NGX credential the server holds. The server logs this
trust model once at startup. Settings also shows a "Not protected" notice while this mode is active;
configuring only an API token does not remove it.

Set `APP_AUTH_MODE=basic` with `APP_AUTH_USERNAME` and `APP_AUTH_PASSWORD` to require one shared
credential. The browser handles the password prompt; there are no user accounts, sessions or roles.
Use HTTPS for connections outside a trusted local link because Basic authentication does not
encrypt credentials. These credentials are separate from the upstream Paperless credential.

Set `APP_AUTH_MODE=proxy` to use an authenticating reverse proxy. Set
`APP_AUTH_TRUSTED_PROXIES` to comma-separated CIDRs for the proxies that directly connect to the
application, and optionally change `APP_AUTH_PROXY_HEADER` (default `Remote-User`). The proxy must
authenticate the user and replace any client-supplied identity header. Any nonempty identity from a
trusted proxy grants the same application access; it does not create an account or role.

Trust uses the actual socket peer from the built Node adapter, including IPv4-mapped IPv6 addresses.
Forwarded address headers, including a configured SvelteKit `ADDRESS_HEADER`, cannot establish
proxy trust. If the adapter does not provide the socket peer, proxy identity is refused; use the
built server for this mode. Configure the narrowest proxy CIDRs and prevent direct untrusted access.

An optional `APP_API_TOKEN` is accepted as a bearer token on `/api/v1/*`, including metrics.
Setting this token alone does not enable protection: mode `none` still permits requests without
credentials, while an explicitly supplied incorrect bearer token is refused. GET health and
readiness probes and OPTIONS requests are exempt. Access protection does not replace the origin
and cross-site request checks. See [access configuration](configuration.md#access-protection).

Run it on a trusted network or behind an authenticating reverse proxy or forward-auth layer.
Do not expose it directly to the internet. To keep it local to the host, publish the port on
loopback only in Compose:

```yaml
ports: ['127.0.0.1:3000:3000']
```

## Paperless-NGX credentials

Authenticate with `PAPERLESS_API_TOKEN` (preferred) or `PAPERLESS_USERNAME` +
`PAPERLESS_PASSWORD`. If both are set, the token is used first. These values are entirely
environment-owned: the Settings page exposes the configured URL as read-only and only reports
whether authentication is configured — it never reads, stores, exports, or accepts these values
through the database or configuration API. See [Configuration — Core
Runtime](configuration.md#core-runtime).

### Required permissions

What the credential needs depends on which features you use:

- **Sync and analysis** only read documents and their text (`GET /api/documents/`,
  `GET /api/documents/{id}/`) — a read-only account is sufficient for these.
- **Applying AI suggestions** patches documents (`PATCH /api/documents/{id}/`) and, unless
  `createMissingEntities: false` is passed, creates missing correspondents, document types, and
  tags. See [AI Processing — Applying Suggestions](ai-processing.md#applying-suggestions).
- **Batch delete** removes non-primary documents from reviewed duplicate groups. See
  [Architecture — Review Flow](architecture.md#review-flow).
- **Paperless-NGX system metrics** (`PAPERLESS_METRICS_ENABLED`) require
  `paperless.view_system_monitoring` for the `status` collector, and
  `paperless.view_global_statistics` for library-wide totals from the `statistics` and
  `document` collectors — without it, Paperless-NGX scopes those counts to what the API user
  can see. See [Paperless-NGX 3 Compatibility — Metrics
  Permissions](paperless-3-compatibility.md#metrics-permissions).

The [Troubleshooting guide](troubleshooting.md#authentication-failures-401) notes that
admin-level tokens work best in practice; scope a dedicated Paperless-NGX account down from
there based on which of the above features you actually use.

## Where document content can leave the deployment

Synced document text and metadata are stored locally in the application's own SQLite database
and are not sent anywhere by sync or analysis — MinHash/LSH scoring runs entirely inside the
container.

**The one path that sends document content outside the deployment is AI processing, and it is
off by default.** Enabling it (`AI_ENABLED=true` plus `AI_OPENAI_API_KEY`) sends each processed
document's text — truncated to `maxContentLength` (8,000 characters by default) — to OpenAI for
metadata extraction. If `includeCorrespondents`, `includeDocumentTypes`, or `includeTags` are
also enabled, the existing names for those fields are sent as reference data alongside the
document text. See [AI Processing](ai-processing.md).

AI results are stored as `pending_review` and are never applied to Paperless-NGX automatically —
scheduled AI processing creates suggestions for review only. See [AI Processing — Status
Lifecycle](ai-processing.md#status-lifecycle).

Outbound notifications are a separate, optional network path. Setting `NOTIFY_URL` enables delivery
to your chosen receiver; without it, no notification request is made. Notifications contain counts,
job identifiers and, when `ORIGIN` is set, an application link. They never include document titles,
text or raw job errors. The destination URL and optional `NOTIFY_AUTH_HEADER` may contain secrets:
they stay in the deployment environment and are not returned by the notification API or written to
notification logs. See [notification configuration](configuration.md#notifications-optional).

Optional OpenTelemetry traces/metrics/logs, Grafana Faro frontend telemetry, and Pyroscope
profiles are separate, independent telemetry paths that you configure with your own OTLP
endpoint — see [Observability](observability.md). Enabling them is unrelated to, and does not
require, the AI path above.

## Secrets and storage

- Paperless-NGX credentials, the OpenAI API key, and OTLP/Pyroscope credentials are all
  environment variables — none are written to the SQLite database.
- Config backup/restore (`GET /api/v1/export/config.json`, `POST /api/v1/import/config`) covers
  mutable app and dedup settings only; environment-owned credentials are excluded. See [API
  Reference — Export / Import](api-reference.md#export-import).
- Existing legacy credential rows in `app_config` are removed during startup migration. See
  [Configuration — Core Runtime](configuration.md#core-runtime).
- The database backup downloaded from **Settings > Database backup** does not contain Paperless
  connection credentials, but it does contain the full text and metadata of every synced document, duplicate decisions, and
  AI review state. Store and delete downloaded copies with the same access controls as the live
  database. See [Database Backup and Restore](database-backup-and-restore.md).

## Network exposure

- `CORS_ALLOW_ORIGIN` defaults to empty (same-origin only). Setting it to `*` permits
  cross-origin reads; state-changing requests require the same origin or an explicitly
  configured origin, and requests marked cross-site are rejected. See
  [Configuration core runtime](configuration.md#core-runtime).
- SvelteKit checks form submissions. Shared API validation also checks state-changing requests
  and requires `Content-Type: application/json` when they have a body. Automation may omit
  `Origin` and `Sec-Fetch-Site` headers.
- Set `ORIGIN` to the URL users access, particularly behind a reverse proxy. When configured,
  API requests must use its host and port. See [Troubleshooting ORIGIN environment
  variable](troubleshooting.md#origin-environment-variable).
- If your Paperless-NGX instance uses a self-signed certificate, setting
  `NODE_TLS_REJECT_UNAUTHORIZED=0` to bypass the resulting Node.js TLS error is explicitly
  documented as **not recommended for production**. See [Troubleshooting — SSL/TLS
  errors](troubleshooting.md#ssltls-errors).

## Container runtime

The production image runs its entrypoint as root only long enough to `chown` the data
directory, then drops privileges via `gosu` to the configured `PUID`/`PGID` (both default to
`1000`) before executing the application. Do not run multiple application containers against
the same SQLite file. See [Upgrading](upgrading.md).

Every push to `main` and a weekly schedule run `hadolint` against the Dockerfile and Trivy
filesystem/misconfiguration scanning, with results uploaded to the repository's GitHub Security
tab.

## Reporting a vulnerability

Report security vulnerabilities via [GitHub Security
Advisories](https://github.com/rknightion/paperless-ngx-dedupe/security/advisories/new) on the
repository rather than a public issue.
