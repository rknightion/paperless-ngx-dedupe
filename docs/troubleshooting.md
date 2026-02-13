# Troubleshooting

## Paperless-NGX Connection Issues

### "Connection refused" or timeout errors

**Symptom:** The Test Connection button fails, or sync jobs fail immediately.

**Causes and fixes:**

- **Wrong URL:** Verify `PAPERLESS_URL` is correct. It should include the protocol and port (e.g., `http://paperless:8000`). Do not include a trailing slash.
- **Docker networking:** If both Paperless-NGX and Paperless-Dedupe run in Docker, `localhost` inside the Dedupe container refers to itself, not the host. Use the container name (e.g., `http://paperless-ngx:8000`) or the Docker network IP. Both containers must be on the same Docker network.
- **Firewall:** Ensure the Paperless-NGX port is accessible from the Dedupe container. On Linux, `iptables` or `ufw` rules may block inter-container traffic.

```bash
# Test connectivity from inside the container
docker compose exec app node -e "fetch('http://paperless:8000/api/').then(r => console.log(r.status)).catch(console.error)"
```

### Authentication failures (401)

**Symptom:** Test Connection returns "Unauthorized" or sync fails with a 401 error.

**Causes and fixes:**

- **Invalid token:** Regenerate your API token in Paperless-NGX and update `PAPERLESS_API_TOKEN`.
- **Wrong auth method:** If using username/password, ensure **both** `PAPERLESS_USERNAME` and `PAPERLESS_PASSWORD` are set. Providing only one will fail.
- **Paperless-NGX permissions:** The token or user must have read access to all documents. Admin-level tokens work best.

```bash
# Verify your token works
curl -H "Authorization: Token your-token-here" http://paperless:8000/api/documents/
```

### SSL/TLS errors

If your Paperless-NGX instance uses HTTPS with a self-signed certificate, the Node.js runtime may reject the connection. This is a security measure. If you must bypass it for local development:

```yaml
# docker-compose.yml (NOT recommended for production)
environment:
  - NODE_TLS_REJECT_UNAUTHORIZED=0
```

## Sync Problems

### "A job of type SYNC is already running"

**Symptom:** POST `/api/v1/sync` returns a 409 error.

**Fix:** Wait for the current sync to complete. Only one sync job can run at a time. Check the current job status:

```bash
curl http://localhost:3000/api/v1/sync/status
```

If a sync appears stuck, check the container logs for errors. If needed, cancel the job:

```bash
curl -X POST http://localhost:3000/api/v1/jobs/{jobId}/cancel
```

### Documents synced but no content

**Symptom:** Documents appear in the Documents page but have no text content.

**Causes:**

- **OCR not complete:** Paperless-NGX may still be processing documents. Wait for Paperless-NGX to finish OCR, then re-sync.
- **Documents without text:** Some documents (images without OCR, corrupted PDFs) may genuinely have no extractable text. Check the Documents page for processing status.

### Slow sync

**Causes:**

- **First sync is always the slowest** because it fetches all documents. Subsequent incremental syncs only fetch changes.
- **Large library:** Syncing thousands of documents takes time. The progress bar shows how many documents have been processed.
- **Network latency:** If Paperless-NGX is on a remote server, network speed is the bottleneck.

Enable debug logging for detailed sync progress:

```bash
LOG_LEVEL=debug
```

## Analysis Issues

### No duplicates found

**Possible causes:**

- **No actual duplicates:** Your library may not contain duplicate documents.
- **Threshold too high:** The default `similarityThreshold` of 0.75 requires strong similarity. Try lowering it to 0.5 or 0.6.
- **Documents too short:** Documents with fewer than `minWords` (default: 20) words are skipped. Check how many documents were analyzed vs. total.
- **Sync incomplete:** Ensure documents have text content. Run sync first if you have not already.

```bash
# Check analysis results
curl http://localhost:3000/api/v1/analysis/status

# Lower the threshold
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{ "similarityThreshold": 0.5 }'
```

### Too many false positives

**Symptom:** The system flags documents as duplicates when they are clearly different.

**Fixes:**

- Raise `similarityThreshold` (e.g., 0.85 or 0.90)
- Increase `confidenceWeightJaccard` to rely more on text overlap rather than metadata
- Reduce `numBands` to narrow the candidate pool
- See [How It Works - Tuning Guide](how-it-works.md#tuning-guide) for detailed guidance

### Documents skipped during analysis

**Symptom:** `documentsAnalyzed` is much lower than `totalDocuments`.

**Cause:** Documents with fewer than `minWords` words are excluded from analysis. This is intentional -- very short documents produce unreliable MinHash signatures.

If you want to include shorter documents:

```bash
curl -X PUT http://localhost:3000/api/v1/config/dedup \
  -H 'Content-Type: application/json' \
  -d '{ "minWords": 5 }'
```

### "A job of type ANALYSIS is already running"

Same as the sync job conflict -- wait for the current analysis to finish or cancel it.

## Database Issues

### "database is locked"

**Symptom:** API requests fail with "database is locked" errors.

**Causes:**

- Multiple processes writing to the same SQLite file simultaneously. Paperless-Dedupe handles this internally, but if you have external tools accessing the same database file, they may conflict.
- A crashed worker left a write lock. Restart the container.

```bash
docker compose restart
```

### Volume permissions

**Symptom:** Container fails to start with "Permission denied" errors for the database.

**Fix:** The container runs as UID 1001. If using a bind mount instead of a named volume, ensure the directory is writable:

```bash
mkdir -p ./data
chown 1001:1001 ./data
```

Named Docker volumes (the default in the provided `docker-compose.yml`) handle permissions automatically.

### Database corruption

In rare cases (e.g., unclean shutdown during a write), SQLite databases can become corrupted.

**Recovery steps:**

1. Stop the container: `docker compose down`
2. Back up the database file from the volume
3. Try the SQLite integrity check:
   ```bash
   sqlite3 /path/to/paperless-dedupe.db "PRAGMA integrity_check;"
   ```
4. If corrupted beyond repair, delete the database and re-sync:
   ```bash
   docker compose down -v
   docker compose up -d
   # Then sync and analyze from scratch
   ```

### Resetting the database

To start fresh, remove the Docker volume:

```bash
docker compose down -v
docker compose up -d
```

This deletes all synced data, duplicate groups, and configuration. You will need to sync and analyze again.

## Docker Issues

### Port conflicts

**Symptom:** Container fails to start with "port is already in use".

**Fix:** Change the host port in your `.env` or `docker-compose.yml`:

```bash
PORT=3001
```

Or map to a different host port directly:

```yaml
ports:
  - '3001:3000'
```

### ORIGIN environment variable

**Symptom:** POST requests return 403 "Cross-site POST form submissions are forbidden".

**Cause:** SvelteKit requires the `ORIGIN` environment variable to match the URL users access the app at. This is a CSRF protection mechanism.

**Fix:** Set `ORIGIN` in your `.env`:

```bash
# For local access
ORIGIN=http://localhost:3000

# Behind a reverse proxy
ORIGIN=https://dedupe.example.com
```

### Read-only filesystem errors

**Symptom:** Application errors mentioning "read-only file system".

**Cause:** The default `docker-compose.yml` uses `read_only: true` for security. The app needs writable access to:

- `/app/data` -- via the volume mount (for the SQLite database)
- `/tmp` -- via tmpfs (for worker threads)

**Fix:** Ensure both are configured:

```yaml
volumes:
  - app-data:/app/data
tmpfs:
  - /tmp
```

### Viewing container logs

```bash
# Follow logs in real-time
docker compose logs -f app

# Last 100 lines
docker compose logs --tail 100 app
```

## Performance Tuning

### Large libraries (10,000+ documents)

- **Sync:** The first sync will take time proportional to your library size. Subsequent syncs are incremental and fast.
- **Analysis:** MinHash signature generation is O(n). LSH candidate detection is sub-quadratic. The most expensive step is detailed scoring of candidate pairs.
- **Memory:** Signatures are stored in the SQLite database, not in memory. RAM usage is modest even for large libraries.

### Reducing analysis time

- Lower `numPermutations` (e.g., 128) -- fewer hash computations per document
- Lower `fuzzySampleSize` (e.g., 2000) -- less text compared per pair
- Raise `similarityThreshold` -- fewer pairs to score in detail
- Increase `minWords` -- skip more short documents

### Reducing false positives in large libraries

Large libraries tend to surface more borderline matches. Consider:

- Setting `similarityThreshold` to 0.85 or higher
- Using the Duplicates page filters to focus on high-confidence groups first

## Getting Help

### Diagnostic information

Gather this information before reporting an issue:

```bash
# Application readiness (checks DB + Paperless connectivity)
curl http://localhost:3000/api/v1/ready

# Container logs
docker compose logs --tail 200 app

# Sync status
curl http://localhost:3000/api/v1/sync/status

# Analysis status
curl http://localhost:3000/api/v1/analysis/status

# Document stats
curl http://localhost:3000/api/v1/documents/stats
```

### Enable debug logging

Set `LOG_LEVEL=debug` in your `.env` file and restart:

```bash
docker compose restart
```

Debug logs include detailed information about API calls, sync progress, and analysis stages.

### Filing issues

Report bugs on the project's GitHub issue tracker. Include:

1. What you were doing when the issue occurred
2. The error message or unexpected behavior
3. Output from the diagnostic commands above
4. Your Docker Compose configuration (redact tokens/passwords)
