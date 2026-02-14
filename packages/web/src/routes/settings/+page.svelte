<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { InfoIcon } from '$lib/components';

  let { data } = $props();

  // Snapshot initial values for editable form fields.
  // These intentionally capture once — users edit them independently.
  const initialConfig = untrack(() => data.config);
  const initialDedup = untrack(() => data.dedupConfig);
  const initialSystemUrl = untrack(() => data.system.paperlessUrl);

  // Derived read-only system info (tracks data changes from invalidateAll)
  let system = $derived(data.system);

  // Connection settings
  let paperlessUrl = $state(initialConfig['paperless.url'] ?? initialSystemUrl ?? '');
  let apiToken = $state(initialConfig['paperless.apiToken'] ?? '');
  let username = $state(initialConfig['paperless.username'] ?? '');
  let password = $state(initialConfig['paperless.password'] ?? '');
  let showToken = $state(false);
  let connectionStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let isTesting = $state(false);
  let isSavingConnection = $state(false);

  // Dedup settings - use $state for form binding
  let threshold = $state(Math.round(initialDedup.similarityThreshold * 100));
  let weightJaccard = $state(initialDedup.confidenceWeightJaccard);
  let weightFuzzy = $state(initialDedup.confidenceWeightFuzzy);
  let weightMetadata = $state(initialDedup.confidenceWeightMetadata);
  let weightFilename = $state(initialDedup.confidenceWeightFilename);
  let numPermutations = $state(initialDedup.numPermutations);
  let numBands = $state(initialDedup.numBands);
  let ngramSize = $state(initialDedup.ngramSize);
  let minWords = $state(initialDedup.minWords);
  let fuzzySampleSize = $state(initialDedup.fuzzySampleSize);
  let autoAnalyze = $state(initialDedup.autoAnalyze);
  let showAdvanced = $state(false);
  let isSavingDedup = $state(false);
  let dedupSaveStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  // Backup & Restore
  let importFile: File | null = $state(null);
  let isImporting = $state(false);
  let importStatus: { type: 'success' | 'error'; message: string } | null = $state(null);

  let weightSum = $derived(weightJaccard + weightFuzzy + weightMetadata + weightFilename);
  let weightsValid = $derived(weightSum === 100);

  async function testConnection() {
    isTesting = true;
    connectionStatus = null;
    try {
      const body: Record<string, string> = { url: paperlessUrl };
      if (apiToken) body.token = apiToken;
      if (username) body.username = username;
      if (password) body.password = password;

      const res = await fetch('/api/v1/config/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.data?.connected) {
        connectionStatus = {
          type: 'success',
          message: `Connected! Paperless v${json.data.version} — ${json.data.documentCount} documents`,
        };
      } else {
        connectionStatus = {
          type: 'error',
          message: json.error?.message ?? 'Connection failed',
        };
      }
    } catch {
      connectionStatus = { type: 'error', message: 'Request failed' };
    }
    isTesting = false;
  }

  async function saveConnection() {
    isSavingConnection = true;
    try {
      const settings: Record<string, string> = {
        'paperless.url': paperlessUrl,
        'paperless.apiToken': apiToken,
        'paperless.username': username,
        'paperless.password': password,
      };
      const res = await fetch('/api/v1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        connectionStatus = { type: 'success', message: 'Settings saved' };
      } else {
        const json = await res.json();
        connectionStatus = { type: 'error', message: json.error?.message ?? 'Save failed' };
      }
    } catch {
      connectionStatus = { type: 'error', message: 'Save failed' };
    }
    isSavingConnection = false;
  }

  async function handleImport() {
    if (!importFile) return;
    isImporting = true;
    importStatus = null;
    try {
      const text = await importFile.text();
      const json = JSON.parse(text);
      const res = await fetch('/api/v1/import/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const result = await res.json();
      if (res.ok) {
        const d = result.data;
        importStatus = {
          type: 'success',
          message: `Imported ${d.appConfigKeys} config keys${d.dedupConfigUpdated ? ' and dedup settings' : ''}`,
        };
        importFile = null;
        await invalidateAll();
      } else {
        importStatus = { type: 'error', message: result.error?.message ?? 'Import failed' };
      }
    } catch {
      importStatus = { type: 'error', message: 'Failed to read or parse file' };
    }
    isImporting = false;
  }

  async function saveDedupConfig() {
    if (!weightsValid) return;
    isSavingDedup = true;
    dedupSaveStatus = null;
    try {
      const res = await fetch('/api/v1/config/dedup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          similarityThreshold: threshold / 100,
          confidenceWeightJaccard: weightJaccard,
          confidenceWeightFuzzy: weightFuzzy,
          confidenceWeightMetadata: weightMetadata,
          confidenceWeightFilename: weightFilename,
          numPermutations,
          numBands,
          ngramSize,
          minWords,
          fuzzySampleSize,
          autoAnalyze,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        const meta = json.meta;
        let msg = 'Configuration saved';
        if (meta?.recalculatedGroups !== undefined) {
          msg += ` — ${meta.recalculatedGroups} groups recalculated`;
        }
        dedupSaveStatus = { type: 'success', message: msg };
      } else {
        dedupSaveStatus = { type: 'error', message: json.error?.message ?? 'Save failed' };
      }
    } catch {
      dedupSaveStatus = { type: 'error', message: 'Save failed' };
    }
    isSavingDedup = false;
  }
</script>

<svelte:head>
  <title>Settings - Paperless Dedupe</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-ink text-3xl font-bold">Settings</h1>
    <p class="text-muted mt-1">Configure Paperless-NGX connection and deduplication parameters.</p>
  </div>

  <!-- Paperless-NGX Connection -->
  <div class="panel">
    <h2 class="text-ink text-lg font-semibold">Paperless-NGX Connection</h2>
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <label for="paperless-url" class="text-ink block text-sm font-medium">URL</label>
        <input
          id="paperless-url"
          type="url"
          bind:value={paperlessUrl}
          placeholder="https://paperless.example.com"
          class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        />
      </div>
      <div class="sm:col-span-2">
        <label for="api-token" class="text-ink block text-sm font-medium">API Token</label>
        <div class="relative mt-1">
          <input
            id="api-token"
            type={showToken ? 'text' : 'password'}
            bind:value={apiToken}
            placeholder="Enter API token"
            class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent w-full rounded-lg border px-3 py-2 pr-20 text-sm focus:ring-1 focus:outline-none"
          />
          <button
            type="button"
            onclick={() => (showToken = !showToken)}
            class="text-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 text-xs"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div>
        <label for="username" class="text-ink block text-sm font-medium">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          placeholder="Username"
          class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        />
      </div>
      <div>
        <label for="password" class="text-ink block text-sm font-medium">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Password"
          class="border-soft bg-surface text-ink placeholder:text-muted focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
        />
      </div>
    </div>
    <div class="mt-4 flex items-center gap-3">
      <button
        onclick={testConnection}
        disabled={isTesting || !paperlessUrl}
        class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isTesting ? 'Testing...' : 'Test Connection'}
      </button>
      <button
        onclick={saveConnection}
        disabled={isSavingConnection}
        class="border-soft text-ink hover:bg-canvas rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {isSavingConnection ? 'Saving...' : 'Save'}
      </button>
    </div>
    {#if connectionStatus}
      <div
        class="mt-3 rounded-lg px-3 py-2 text-sm {connectionStatus.type === 'success'
          ? 'bg-success-light text-success'
          : 'bg-ember-light text-ember'}"
      >
        {connectionStatus.message}
      </div>
    {/if}
  </div>

  <!-- Dedup Parameters -->
  <div class="panel">
    <h2 class="text-ink text-lg font-semibold">Deduplication Parameters</h2>

    <!-- Similarity Threshold -->
    <div class="mt-4">
      <label for="threshold" class="text-ink block text-sm font-medium">
        Similarity Threshold: <span class="font-mono">{threshold}%</span>
      </label>
      <input
        id="threshold"
        type="range"
        min="0"
        max="100"
        bind:value={threshold}
        class="accent-accent mt-2 w-full"
      />
      <p class="text-muted mt-1 text-xs">
        Documents scoring above this threshold are grouped as duplicates.
      </p>
    </div>

    <!-- Weight Sliders -->
    <div class="mt-6">
      <div class="flex items-center justify-between">
        <h3 class="text-ink text-sm font-medium">Confidence Weights</h3>
        <span class="font-mono text-sm {weightsValid ? 'text-success' : 'text-ember'}">
          Sum: {weightSum}/100
        </span>
      </div>
      <div class="mt-3 grid gap-6 sm:grid-cols-2">
        <div>
          <label for="w-jaccard" class="text-muted block text-sm">
            Jaccard: <span class="text-ink font-mono font-medium">{weightJaccard}</span>
          </label>
          <p class="text-muted mt-0.5 text-xs">
            Measures structural overlap between document word patterns using MinHash fingerprints.
          </p>
          <input
            id="w-jaccard"
            type="range"
            min="0"
            max="100"
            bind:value={weightJaccard}
            class="accent-accent mt-1 w-full"
          />
          <details class="mt-1.5">
            <summary class="text-accent hover:text-accent-hover cursor-pointer text-xs font-medium">
              How does this work?
            </summary>
            <div class="text-muted bg-canvas mt-1.5 rounded-lg px-3 py-2 text-xs leading-relaxed">
              Jaccard similarity estimates how much two documents share the same word sequences
              (n-grams). It works by comparing compact fingerprints (MinHash signatures) rather than
              raw text, making it fast even for large documents.
              <strong class="text-ink">Higher weight</strong> means structural text overlap matters
              more for the overall confidence score.
              <br /><br />
              <strong class="text-ink">Best for:</strong> catching near-identical documents, OCR re-scans,
              or minor edits. A value of 0 disables this factor entirely.
            </div>
          </details>
        </div>
        <div>
          <label for="w-fuzzy" class="text-muted block text-sm">
            Fuzzy: <span class="text-ink font-mono font-medium">{weightFuzzy}</span>
          </label>
          <p class="text-muted mt-0.5 text-xs">
            Compares document text using character-level edit distance after sorting words.
          </p>
          <input
            id="w-fuzzy"
            type="range"
            min="0"
            max="100"
            bind:value={weightFuzzy}
            class="accent-accent mt-1 w-full"
          />
          <details class="mt-1.5">
            <summary class="text-accent hover:text-accent-hover cursor-pointer text-xs font-medium">
              How does this work?
            </summary>
            <div class="text-muted bg-canvas mt-1.5 rounded-lg px-3 py-2 text-xs leading-relaxed">
              Fuzzy text matching uses a token-sort Levenshtein ratio: it alphabetically sorts all
              words in each document, then measures the edit distance between the sorted strings.
              This makes it resilient to paragraph reordering. It operates on a sample of the text
              (controlled by Fuzzy Sample Size in advanced settings).
              <strong class="text-ink">Higher weight</strong> means character-level text similarity
              matters more.
              <br /><br />
              <strong class="text-ink">Best for:</strong> catching documents with reworded sentences,
              different formatting, or OCR errors.
            </div>
          </details>
        </div>
        <div>
          <label for="w-metadata" class="text-muted block text-sm">
            Metadata: <span class="text-ink font-mono font-medium">{weightMetadata}</span>
          </label>
          <p class="text-muted mt-0.5 text-xs">
            Compares file size, creation date, document type, and correspondent.
          </p>
          <input
            id="w-metadata"
            type="range"
            min="0"
            max="100"
            bind:value={weightMetadata}
            class="accent-accent mt-1 w-full"
          />
          <details class="mt-1.5">
            <summary class="text-accent hover:text-accent-hover cursor-pointer text-xs font-medium">
              How does this work?
            </summary>
            <div class="text-muted bg-canvas mt-1.5 rounded-lg px-3 py-2 text-xs leading-relaxed">
              Metadata similarity is an average of four sub-scores: file size ratio (how close the
              byte sizes are), date proximity (documents created within 30 days score 1.0, over a
              year apart score 0.0), document type match (exact match = 1.0), and correspondent
              match (exact match = 1.0). Missing metadata fields are excluded from the average.
              <strong class="text-ink">Higher weight</strong> means document metadata matters more.
              <br /><br />
              <strong class="text-ink">Best for:</strong> environments where documents are well-tagged
              and dates are reliable.
            </div>
          </details>
        </div>
        <div>
          <label for="w-filename" class="text-muted block text-sm">
            Filename: <span class="text-ink font-mono font-medium">{weightFilename}</span>
          </label>
          <p class="text-muted mt-0.5 text-xs">
            Compares document titles using fuzzy string matching.
          </p>
          <input
            id="w-filename"
            type="range"
            min="0"
            max="100"
            bind:value={weightFilename}
            class="accent-accent mt-1 w-full"
          />
          <details class="mt-1.5">
            <summary class="text-accent hover:text-accent-hover cursor-pointer text-xs font-medium">
              How does this work?
            </summary>
            <div class="text-muted bg-canvas mt-1.5 rounded-lg px-3 py-2 text-xs leading-relaxed">
              Filename similarity applies the same token-sort Levenshtein ratio used by fuzzy text
              matching, but on the document titles instead of the full content. This catches files
              that were renamed slightly (e.g., "Invoice_2024.pdf" vs "Invoice 2024 copy.pdf").
              <strong class="text-ink">Higher weight</strong> means title similarity matters more.
              <br /><br />
              <strong class="text-ink">Best for:</strong> environments where filenames are descriptive
              and consistently named.
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- Advanced Section -->
    <div class="border-soft mt-6 border-t pt-4">
      <button
        onclick={() => (showAdvanced = !showAdvanced)}
        class="text-accent hover:text-accent-hover text-sm font-medium"
      >
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </button>
      {#if showAdvanced}
        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label for="num-perms" class="text-muted flex items-center gap-1.5 text-sm">
              Permutations
              <InfoIcon
                text="Number of hash functions in the MinHash signature. More permutations = more accurate Jaccard estimates but slower processing. Must evenly divide by LSH Bands. Default: 192."
                position="top"
              />
            </label>
            <input
              id="num-perms"
              type="number"
              min="16"
              max="1024"
              bind:value={numPermutations}
              class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            />
          </div>
          <div>
            <label for="num-bands" class="text-muted flex items-center gap-1.5 text-sm">
              LSH Bands
              <InfoIcon
                text="Number of bands for Locality-Sensitive Hashing. More bands = more candidate pairs found (higher recall) but more comparisons to score. Must evenly divide Permutations. Default: 20."
                position="top"
              />
            </label>
            <input
              id="num-bands"
              type="number"
              min="1"
              max="100"
              bind:value={numBands}
              class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            />
          </div>
          <div>
            <label for="ngram-size" class="text-muted flex items-center gap-1.5 text-sm">
              N-gram Size
              <InfoIcon
                text="Number of consecutive words per shingle. Smaller values (2) catch short overlapping phrases; larger values (4–5) require longer matching sequences. Default: 3."
                position="top"
              />
            </label>
            <input
              id="ngram-size"
              type="number"
              min="1"
              max="10"
              bind:value={ngramSize}
              class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            />
          </div>
          <div>
            <label for="min-words" class="text-muted flex items-center gap-1.5 text-sm">
              Min Words
              <InfoIcon
                text="Documents with fewer words than this are skipped during fingerprinting. Prevents false matches on very short documents like cover pages. Default: 20."
                position="top"
              />
            </label>
            <input
              id="min-words"
              type="number"
              min="1"
              max="1000"
              bind:value={minWords}
              class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            />
          </div>
          <div>
            <label for="fuzzy-sample" class="text-muted flex items-center gap-1.5 text-sm">
              Fuzzy Sample Size
              <InfoIcon
                text="Maximum number of characters sampled from each document for fuzzy text comparison. Higher values are more accurate but slower. Default: 5,000."
                position="top"
              />
            </label>
            <input
              id="fuzzy-sample"
              type="number"
              min="100"
              max="100000"
              bind:value={fuzzySampleSize}
              class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            />
          </div>
          <div class="flex items-end">
            <label class="text-muted flex items-center gap-2 text-sm">
              <input type="checkbox" bind:checked={autoAnalyze} class="rounded" />
              Auto-analyze after sync
              <InfoIcon
                text="When enabled, duplicate analysis runs automatically after each document sync completes. Disable to run analysis manually from the Dashboard."
                position="top"
              />
            </label>
          </div>
        </div>
      {/if}
    </div>

    <!-- Save Button -->
    <div class="mt-6 flex items-center gap-3">
      <button
        onclick={saveDedupConfig}
        disabled={!weightsValid || isSavingDedup}
        class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSavingDedup ? 'Saving...' : 'Save Configuration'}
      </button>
      {#if !weightsValid}
        <span class="text-ember text-sm">Weights must sum to 100</span>
      {/if}
    </div>
    {#if dedupSaveStatus}
      <div
        class="mt-3 rounded-lg px-3 py-2 text-sm {dedupSaveStatus.type === 'success'
          ? 'bg-success-light text-success'
          : 'bg-ember-light text-ember'}"
      >
        {dedupSaveStatus.message}
      </div>
    {/if}
  </div>

  <!-- System Information -->
  <div class="panel">
    <h2 class="text-ink text-lg font-semibold">System Information</h2>
    <dl class="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <dt class="text-muted text-sm">Database Path</dt>
        <dd class="text-ink mt-0.5 truncate font-mono text-sm">{system.databaseUrl}</dd>
      </div>
      <div>
        <dt class="text-muted text-sm">Total Documents</dt>
        <dd class="text-ink mt-0.5 text-sm font-medium">
          {system.totalDocuments.toLocaleString()}
        </dd>
      </div>
      <div>
        <dt class="text-muted text-sm">Unresolved Groups</dt>
        <dd class="text-ink mt-0.5 text-sm font-medium">
          {system.duplicateGroups.toLocaleString()}
        </dd>
      </div>
    </dl>
  </div>

  <!-- Backup & Restore -->
  <div class="panel">
    <h2 class="text-ink text-lg font-semibold">Backup & Restore</h2>
    <div class="mt-4 space-y-4">
      <div>
        <h3 class="text-ink text-sm font-medium">Export Configuration</h3>
        <p class="text-muted mt-1 text-xs">
          Download a backup of all settings and dedup parameters.
        </p>
        <a
          href="/api/v1/export/config.json"
          download
          class="border-soft text-ink hover:bg-canvas mt-2 inline-block rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Download Backup
        </a>
      </div>
      <div class="border-soft border-t pt-4">
        <h3 class="text-ink text-sm font-medium">Import Configuration</h3>
        <p class="text-muted mt-1 text-xs">
          Restore settings from a previously exported backup file.
        </p>
        <div class="mt-2 flex items-center gap-3">
          <input
            type="file"
            accept=".json"
            onchange={(e) => {
              const target = e.target as HTMLInputElement;
              importFile = target.files?.[0] ?? null;
              importStatus = null;
            }}
            class="text-ink file:border-soft file:text-ink file:hover:bg-canvas text-sm file:mr-3 file:rounded-lg file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <button
            onclick={handleImport}
            disabled={!importFile || isImporting}
            class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
    {#if importStatus}
      <div
        class="mt-3 rounded-lg px-3 py-2 text-sm {importStatus.type === 'success'
          ? 'bg-success-light text-success'
          : 'bg-ember-light text-ember'}"
      >
        {importStatus.message}
      </div>
    {/if}
  </div>
</div>
