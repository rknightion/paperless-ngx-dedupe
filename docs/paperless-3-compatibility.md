---
title: Paperless-NGX 3 Compatibility
description: Paperless-NGX 3 API compatibility and permission requirements
---

# Paperless-NGX 3 Compatibility

Paperless NGX Dedupe is compatible with Paperless-NGX 3.x. The integration was checked against
the Paperless-NGX 3.0.0 API v10 implementation and schemas.

## API Version Negotiation

The client starts with an unversioned `Accept: application/json` request, reads Paperless's
`X-Api-Version` response header, and pins later requests to that version. This supports the
Paperless 3 default API while retaining compatibility with older Paperless 2 releases that reject
an unsupported hard-coded API version.

## Validated Surfaces

| App capability | Paperless API surface | Paperless 3 status |
| --- | --- | --- |
| Connection and document count | `/api/statistics/`, `/api/documents/` fallback | Compatible |
| Document sync and lookup | `/api/documents/`, `/api/documents/{id}/` | Compatible |
| Correspondents, document types, tags, storage paths | Matching paginated endpoints | Compatible |
| Custom-field definitions and values | `/api/custom_fields/`, document `custom_fields` | Compatible; select option IDs preserved |
| Apply AI metadata | `PATCH /api/documents/{id}/` | Compatible; custom fields use safe read-modify-write |
| Delete and bulk actions | Document `DELETE`, `/api/documents/bulk_edit/` | Compatible for the operations used by this app |
| System metrics | `/api/status/`, `/api/statistics/`, entity endpoints | Compatible |
| Preview and thumbnail proxying | Document `preview` and `thumb` endpoints | Compatible |

Paperless 3's API v10 deprecates some legacy bulk-edit methods. This app does not use the
deprecated merge, rotate, split, or page-deletion methods.

## Metrics Permissions

Paperless 3 applies explicit permissions to system-wide observability:

- `paperless.view_system_monitoring` is required for the `status` collector unless the API user is
  staff or a superuser.
- `paperless.view_global_statistics` is required for global statistics. Without it, Paperless
  returns counts scoped to objects visible to the API user.

The `statistics` and `document` collectors share one statistics request per scrape. Other entity
collectors remain paginated because their metric labels require individual records.

## Custom-Field Safety

Paperless treats a document `custom_fields` update as replacement of the entire list. The app
therefore reads the current document immediately before applying recommendations, updates only the
selected field IDs, preserves every unrelated value, and records the full before/after values for
revert.
