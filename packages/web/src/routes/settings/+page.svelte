<script lang="ts">
  let { data } = $props();

  // Snapshot initial values for editable form fields.
  // These intentionally capture once — users edit them independently.
  const initialConfig = data.config;
  const initialDedup = data.dedupConfig;
  const initialSystemUrl = data.system.paperlessUrl;

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
    <h1 class="text-3xl font-bold text-ink">Settings</h1>
    <p class="mt-1 text-muted">Configure Paperless-NGX connection and deduplication parameters.</p>
  </div>

  <!-- Paperless-NGX Connection -->
  <div class="panel">
    <h2 class="text-lg font-semibold text-ink">Paperless-NGX Connection</h2>
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <label for="paperless-url" class="block text-sm font-medium text-ink">URL</label>
        <input
          id="paperless-url"
          type="url"
          bind:value={paperlessUrl}
          placeholder="https://paperless.example.com"
          class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div class="sm:col-span-2">
        <label for="api-token" class="block text-sm font-medium text-ink">API Token</label>
        <div class="relative mt-1">
          <input
            id="api-token"
            type={showToken ? 'text' : 'password'}
            bind:value={apiToken}
            placeholder="Enter API token"
            class="w-full rounded-lg border border-soft bg-surface px-3 py-2 pr-20 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onclick={() => (showToken = !showToken)}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-ink"
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div>
        <label for="username" class="block text-sm font-medium text-ink">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          placeholder="Username"
          class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label for="password" class="block text-sm font-medium text-ink">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Password"
          class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </div>
    <div class="mt-4 flex items-center gap-3">
      <button
        onclick={testConnection}
        disabled={isTesting || !paperlessUrl}
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {isTesting ? 'Testing...' : 'Test Connection'}
      </button>
      <button
        onclick={saveConnection}
        disabled={isSavingConnection}
        class="rounded-lg border border-soft px-4 py-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
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
    <h2 class="text-lg font-semibold text-ink">Deduplication Parameters</h2>

    <!-- Similarity Threshold -->
    <div class="mt-4">
      <label for="threshold" class="block text-sm font-medium text-ink">
        Similarity Threshold: <span class="font-mono">{threshold}%</span>
      </label>
      <input
        id="threshold"
        type="range"
        min="0"
        max="100"
        bind:value={threshold}
        class="mt-2 w-full accent-accent"
      />
      <p class="mt-1 text-xs text-muted">Documents scoring above this threshold are grouped as duplicates.</p>
    </div>

    <!-- Weight Sliders -->
    <div class="mt-6">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-ink">Confidence Weights</h3>
        <span
          class="text-sm font-mono {weightsValid ? 'text-success' : 'text-ember'}"
        >
          Sum: {weightSum}/100
        </span>
      </div>
      <div class="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label for="w-jaccard" class="block text-sm text-muted">
            Jaccard: <span class="font-mono font-medium text-ink">{weightJaccard}</span>
          </label>
          <input id="w-jaccard" type="range" min="0" max="100" bind:value={weightJaccard} class="mt-1 w-full accent-accent" />
        </div>
        <div>
          <label for="w-fuzzy" class="block text-sm text-muted">
            Fuzzy: <span class="font-mono font-medium text-ink">{weightFuzzy}</span>
          </label>
          <input id="w-fuzzy" type="range" min="0" max="100" bind:value={weightFuzzy} class="mt-1 w-full accent-accent" />
        </div>
        <div>
          <label for="w-metadata" class="block text-sm text-muted">
            Metadata: <span class="font-mono font-medium text-ink">{weightMetadata}</span>
          </label>
          <input id="w-metadata" type="range" min="0" max="100" bind:value={weightMetadata} class="mt-1 w-full accent-accent" />
        </div>
        <div>
          <label for="w-filename" class="block text-sm text-muted">
            Filename: <span class="font-mono font-medium text-ink">{weightFilename}</span>
          </label>
          <input id="w-filename" type="range" min="0" max="100" bind:value={weightFilename} class="mt-1 w-full accent-accent" />
        </div>
      </div>
    </div>

    <!-- Advanced Section -->
    <div class="mt-6 border-t border-soft pt-4">
      <button
        onclick={() => (showAdvanced = !showAdvanced)}
        class="text-sm font-medium text-accent hover:text-accent-hover"
      >
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </button>
      {#if showAdvanced}
        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label for="num-perms" class="block text-sm text-muted">Permutations</label>
            <input
              id="num-perms"
              type="number"
              min="16"
              max="1024"
              bind:value={numPermutations}
              class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label for="num-bands" class="block text-sm text-muted">LSH Bands</label>
            <input
              id="num-bands"
              type="number"
              min="1"
              max="100"
              bind:value={numBands}
              class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label for="ngram-size" class="block text-sm text-muted">N-gram Size</label>
            <input
              id="ngram-size"
              type="number"
              min="1"
              max="10"
              bind:value={ngramSize}
              class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label for="min-words" class="block text-sm text-muted">Min Words</label>
            <input
              id="min-words"
              type="number"
              min="1"
              max="1000"
              bind:value={minWords}
              class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label for="fuzzy-sample" class="block text-sm text-muted">Fuzzy Sample Size</label>
            <input
              id="fuzzy-sample"
              type="number"
              min="100"
              max="100000"
              bind:value={fuzzySampleSize}
              class="mt-1 w-full rounded-lg border border-soft bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div class="flex items-end">
            <label class="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" bind:checked={autoAnalyze} class="rounded" />
              Auto-analyze after sync
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
        class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {isSavingDedup ? 'Saving...' : 'Save Configuration'}
      </button>
      {#if !weightsValid}
        <span class="text-sm text-ember">Weights must sum to 100</span>
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
    <h2 class="text-lg font-semibold text-ink">System Information</h2>
    <dl class="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <dt class="text-sm text-muted">Database Dialect</dt>
        <dd class="mt-0.5 text-sm font-medium text-ink">{system.databaseDialect}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Database Path</dt>
        <dd class="mt-0.5 truncate text-sm font-mono text-ink">{system.databaseUrl}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Total Documents</dt>
        <dd class="mt-0.5 text-sm font-medium text-ink">{system.totalDocuments.toLocaleString()}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted">Unresolved Groups</dt>
        <dd class="mt-0.5 text-sm font-medium text-ink">{system.duplicateGroups.toLocaleString()}</dd>
      </div>
    </dl>
  </div>
</div>
