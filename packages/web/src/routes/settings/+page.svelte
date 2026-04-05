<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { InfoIcon, RichTooltip, StaleAnalysisBanner } from '$lib/components';
  import {
    trackSettingsSaved,
    trackConnectionTested,
    trackConfigExported,
    trackConfigImported,
  } from '$lib/faro-events';
  import {
    Link,
    SlidersHorizontal,
    Info,
    Archive,
    Brain,
    MessageCircleQuestion,
    AlertTriangle,
    Check,
  } from 'lucide-svelte';
  import { validateTagAliasYaml } from '@paperless-dedupe/core';

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
  let penaltyStrength = $state(initialDedup.discriminativePenaltyStrength);
  let numPermutations = $state(initialDedup.numPermutations);
  let numBands = $state(initialDedup.numBands);
  let ngramSize = $state(initialDedup.ngramSize);
  let minWords = $state(initialDedup.minWords);
  let fuzzySampleSize = $state(initialDedup.fuzzySampleSize);
  let autoAnalyze = $state(initialDedup.autoAnalyze);
  let showAdvanced = $state(false);
  let isSavingDedup = $state(false);
  let dedupSaveStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let analysisStale = $state(false);

  // Backup & Restore
  let importFile: File | null = $state(null);
  let isImporting = $state(false);
  let importStatus: { type: 'success' | 'error'; message: string } | null = $state(null);

  // AI Settings
  const initialAiConfig = untrack(() => data.aiConfig);
  let aiModel = $state(initialAiConfig?.model ?? 'gpt-5-mini');
  let aiAutoProcess = $state(initialAiConfig?.autoProcess ?? false);
  let aiAddProcessedTag = $state(initialAiConfig?.addProcessedTag ?? false);
  let aiProcessedTagName = $state(initialAiConfig?.processedTagName ?? 'ai-processed');
  let aiProtectedTagsEnabled = $state(initialAiConfig?.protectedTagsEnabled ?? false);
  let aiProtectedTagsInput = $state((initialAiConfig?.protectedTagNames ?? ['email']).join(', '));
  let aiPromptTemplate = $state(initialAiConfig?.promptTemplate ?? '');
  let aiMaxContentLength = $state(initialAiConfig?.maxContentLength ?? 8000);
  let aiBatchSize = $state(initialAiConfig?.batchSize ?? 10);
  let aiRateDelayMs = $state(initialAiConfig?.rateDelayMs ?? 500);
  let aiIncludeCorrespondents = $state(initialAiConfig?.includeCorrespondents ?? false);
  let aiIncludeDocumentTypes = $state(initialAiConfig?.includeDocumentTypes ?? false);
  let aiIncludeTags = $state(initialAiConfig?.includeTags ?? false);
  let aiReasoningEffort = $state(initialAiConfig?.reasoningEffort ?? 'low');
  let aiMaxRetries = $state(initialAiConfig?.maxRetries ?? 3);
  let aiFlexProcessing = $state(initialAiConfig?.flexProcessing ?? true);
  let aiExtractTitle = $state(initialAiConfig?.extractTitle ?? true);
  let aiExtractCorrespondent = $state(initialAiConfig?.extractCorrespondent ?? true);
  let aiExtractDocumentType = $state(initialAiConfig?.extractDocumentType ?? true);
  let aiExtractTags = $state(initialAiConfig?.extractTags ?? true);
  let isDefaultPrompt = $state(untrack(() => data.isDefaultPrompt) ?? true);
  let showPrompt = $state(false);
  let showAiAdvanced = $state(false);
  let resetConfirmCount = $state<number | null>(null);
  let isResetting = $state(false);
  let showRevertResetPrompt = $state(false);

  // Tag alias mapping
  let aiTagAliasesEnabled = $state(initialAiConfig?.tagAliasesEnabled ?? false);
  let aiTagAliasMap = $state(initialAiConfig?.tagAliasMap ?? '');
  let isDefaultTagAliasMap = $state(untrack(() => data.isDefaultTagAliasMap) ?? true);
  let showTagAliases = $state(false);
  let tagAliasValidationError = $state<string | null>(null);
  let showRevertResetTagAliases = $state(false);

  let isSavingAi = $state(false);
  let aiSaveStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let aiModels = $state<{ id: string; name: string }[]>([]);

  // Confidence gates
  let aiConfidenceGlobal = $state(
    Math.round((initialAiConfig?.confidenceThresholdGlobal ?? 0) * 100),
  );
  let aiConfidenceTitle = $state(
    Math.round((initialAiConfig?.confidenceThresholdTitle ?? 0) * 100),
  );
  let aiConfidenceCorrespondent = $state(
    Math.round((initialAiConfig?.confidenceThresholdCorrespondent ?? 0) * 100),
  );
  let aiConfidenceDocType = $state(
    Math.round((initialAiConfig?.confidenceThresholdDocumentType ?? 0) * 100),
  );
  let aiConfidenceTags = $state(Math.round((initialAiConfig?.confidenceThresholdTags ?? 0) * 100));
  let aiNeverAutoCreate = $state(initialAiConfig?.neverAutoCreateEntities ?? false);
  let aiNeverOverwrite = $state(initialAiConfig?.neverOverwriteNonEmpty ?? false);
  let aiTagsOnly = $state(initialAiConfig?.tagsOnlyAutoApply ?? false);
  let showConfidenceFields = $state(false);

  // Auto-apply rules
  let aiAutoApply = $state(initialAiConfig?.autoApplyEnabled ?? false);
  let aiAutoApplyRequireThreshold = $state(
    initialAiConfig?.autoApplyRequireAllAboveThreshold ?? true,
  );
  let aiAutoApplyRequireNoNew = $state(initialAiConfig?.autoApplyRequireNoNewEntities ?? true);
  let aiAutoApplyRequireNoClearing = $state(initialAiConfig?.autoApplyRequireNoClearing ?? true);
  let aiAutoApplyRequireOcr = $state(initialAiConfig?.autoApplyRequireOcrText ?? true);

  // RAG Settings
  const initialRagConfig = untrack(() => data.ragConfig);
  const initialRagStats = untrack(() => data.ragStats);
  let ragEmbeddingModel = $state(initialRagConfig?.embeddingModel ?? 'text-embedding-3-small');
  let ragEmbeddingDimensions = $state(initialRagConfig?.embeddingDimensions ?? 1536);
  let ragChunkSize = $state(initialRagConfig?.chunkSize ?? 400);
  let ragChunkOverlap = $state(initialRagConfig?.chunkOverlap ?? 40);
  let ragTopK = $state(initialRagConfig?.topK ?? 20);
  let ragAnswerModel = $state(initialRagConfig?.answerModel ?? 'gpt-5.4-mini');
  let ragSystemPrompt = $state(initialRagConfig?.systemPrompt ?? '');
  let ragMaxContextTokens = $state(initialRagConfig?.maxContextTokens ?? 8000);
  let ragAutoIndex = $state(initialRagConfig?.autoIndex ?? false);
  let showRagPrompt = $state(false);
  let showRagAdvanced = $state(false);
  let isSavingRag = $state(false);
  let ragSaveStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let ragModels = $state<{ id: string; name: string }[]>([]);
  let ragStats = $state(initialRagStats);
  let isRagIndexing = $state(false);

  let weightSum = $derived(weightJaccard + weightFuzzy);
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
        trackConnectionTested(true);
        connectionStatus = {
          type: 'success',
          message: `Connected! Paperless v${json.data.version} — ${json.data.documentCount} documents`,
        };
      } else {
        trackConnectionTested(false);
        connectionStatus = {
          type: 'error',
          message: json.error?.message ?? 'Connection failed',
        };
      }
    } catch {
      trackConnectionTested(false);
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
        trackSettingsSaved('connection');
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
        trackConfigImported(true);
        const d = result.data;
        importStatus = {
          type: 'success',
          message: `Imported ${d.appConfigKeys} config keys${d.dedupConfigUpdated ? ' and dedup settings' : ''}`,
        };
        importFile = null;
        await invalidateAll();
      } else {
        trackConfigImported(false);
        importStatus = { type: 'error', message: result.error?.message ?? 'Import failed' };
      }
    } catch {
      trackConfigImported(false);
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
          discriminativePenaltyStrength: penaltyStrength,
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
        trackSettingsSaved('dedup');
        const meta = json.meta;
        let msg = 'Configuration saved';
        if (meta?.recalculatedGroups !== undefined) {
          msg += ` — ${meta.recalculatedGroups} groups recalculated`;
        }
        dedupSaveStatus = { type: 'success', message: msg };
        analysisStale = meta?.analysisStale === true;
      } else {
        dedupSaveStatus = { type: 'error', message: json.error?.message ?? 'Save failed' };
      }
    } catch {
      dedupSaveStatus = { type: 'error', message: 'Save failed' };
    }
    isSavingDedup = false;
  }

  async function fetchAiModels() {
    try {
      const res = await fetch('/api/v1/ai/models');
      const json = await res.json();
      if (res.ok) {
        aiModels = json.data ?? [];
      }
    } catch {
      aiModels = [];
    }
  }

  $effect(() => {
    if (data.aiEnabled) {
      fetchAiModels();
    }
  });

  async function saveAiConfig() {
    isSavingAi = true;
    aiSaveStatus = null;
    // Validate tag alias YAML before saving (always validate — server rejects invalid YAML regardless of toggle)
    if (aiTagAliasMap.trim()) {
      const validation = validateTagAliasYaml(aiTagAliasMap);
      if (!validation.valid) {
        tagAliasValidationError = validation.error ?? 'Invalid YAML';
        isSavingAi = false;
        return;
      }
    }
    tagAliasValidationError = null;
    try {
      const res = await fetch('/api/v1/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModel,
          autoProcess: aiAutoProcess,
          addProcessedTag: aiAddProcessedTag,
          processedTagName: aiProcessedTagName,
          promptTemplate: aiPromptTemplate,
          maxContentLength: aiMaxContentLength,
          batchSize: aiBatchSize,
          rateDelayMs: aiRateDelayMs,
          includeCorrespondents: aiIncludeCorrespondents,
          includeDocumentTypes: aiIncludeDocumentTypes,
          includeTags: aiIncludeTags,
          reasoningEffort: aiReasoningEffort,
          maxRetries: aiMaxRetries,
          flexProcessing: aiFlexProcessing,
          extractTitle: aiExtractTitle,
          extractCorrespondent: aiExtractCorrespondent,
          extractDocumentType: aiExtractDocumentType,
          extractTags: aiExtractTags,
          confidenceThresholdGlobal: aiConfidenceGlobal / 100,
          confidenceThresholdTitle: aiConfidenceTitle / 100,
          confidenceThresholdCorrespondent: aiConfidenceCorrespondent / 100,
          confidenceThresholdDocumentType: aiConfidenceDocType / 100,
          confidenceThresholdTags: aiConfidenceTags / 100,
          neverAutoCreateEntities: aiNeverAutoCreate,
          neverOverwriteNonEmpty: aiNeverOverwrite,
          tagsOnlyAutoApply: aiTagsOnly,
          protectedTagsEnabled: aiProtectedTagsEnabled,
          protectedTagNames: aiProtectedTagsInput
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0),
          tagAliasesEnabled: aiTagAliasesEnabled,
          tagAliasMap: aiTagAliasMap,
          autoApplyEnabled: aiAutoApply,
          autoApplyRequireAllAboveThreshold: aiAutoApplyRequireThreshold,
          autoApplyRequireNoNewEntities: aiAutoApplyRequireNoNew,
          autoApplyRequireNoClearing: aiAutoApplyRequireNoClearing,
          autoApplyRequireOcrText: aiAutoApplyRequireOcr,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        trackSettingsSaved('ai');
        aiSaveStatus = { type: 'success', message: 'AI configuration saved' };
      } else {
        aiSaveStatus = { type: 'error', message: json.error?.message ?? 'Save failed' };
      }
    } catch {
      aiSaveStatus = { type: 'error', message: 'Save failed' };
    }
    isSavingAi = false;
  }

  async function fetchRagModels() {
    try {
      const res = await fetch('/api/v1/ai/models');
      const json = await res.json();
      if (res.ok) ragModels = json.data ?? [];
    } catch {
      ragModels = [];
    }
  }

  $effect(() => {
    if (data.ragEnabled) {
      fetchRagModels();
    }
  });

  async function saveRagConfig() {
    isSavingRag = true;
    ragSaveStatus = null;
    try {
      const res = await fetch('/api/v1/rag/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeddingModel: ragEmbeddingModel,
          embeddingDimensions: ragEmbeddingDimensions,
          chunkSize: ragChunkSize,
          chunkOverlap: ragChunkOverlap,
          topK: ragTopK,
          answerModel: ragAnswerModel,
          systemPrompt: ragSystemPrompt,
          maxContextTokens: ragMaxContextTokens,
          autoIndex: ragAutoIndex,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        trackSettingsSaved('rag');
        ragSaveStatus = { type: 'success', message: 'Document Q&A configuration saved' };
      } else {
        ragSaveStatus = { type: 'error', message: json.error?.message ?? 'Save failed' };
      }
    } catch {
      ragSaveStatus = { type: 'error', message: 'Save failed' };
    }
    isSavingRag = false;
  }

  async function rebuildRagIndex() {
    isRagIndexing = true;
    try {
      await fetch('/api/v1/rag/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rebuild: true }),
      });
    } catch {
      isRagIndexing = false;
    }
  }

  async function revertPrompt() {
    try {
      // Reset to empty so the server default is used
      aiPromptTemplate = '';
      // Save immediately with empty prompt to revert
      const saveRes = await fetch('/api/v1/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptTemplate: undefined }),
      });
      if (saveRes.ok) {
        // Re-fetch to get the default
        const freshRes = await fetch('/api/v1/ai/config');
        const freshJson = await freshRes.json();
        if (freshRes.ok) {
          aiPromptTemplate = freshJson.data?.promptTemplate ?? '';
        }
        isDefaultPrompt = true;
        showRevertResetPrompt = true;
      }
    } catch {
      aiSaveStatus = { type: 'error', message: 'Failed to revert prompt' };
    }
  }

  async function revertTagAliases() {
    try {
      aiTagAliasMap = '';
      const saveRes = await fetch('/api/v1/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagAliasMap: undefined }),
      });
      if (saveRes.ok) {
        const freshRes = await fetch('/api/v1/ai/config');
        const freshJson = await freshRes.json();
        if (freshRes.ok) {
          aiTagAliasMap = freshJson.data?.tagAliasMap ?? '';
        }
        isDefaultTagAliasMap = true;
        showRevertResetTagAliases = true;
      }
    } catch {
      aiSaveStatus = { type: 'error', message: 'Failed to revert tag alias map' };
    }
  }

  async function resetProcessingHistory() {
    isResetting = true;
    try {
      const res = await fetch('/api/v1/ai/results/clear', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        aiSaveStatus = {
          type: 'success',
          message: `${json.data?.deleted ?? 0} AI processing results cleared`,
        };
      } else {
        aiSaveStatus = { type: 'error', message: json.error?.message ?? 'Reset failed' };
      }
    } catch {
      aiSaveStatus = { type: 'error', message: 'Reset failed' };
    }
    isResetting = false;
    resetConfirmCount = null;
  }

  async function showResetConfirmation() {
    try {
      const res = await fetch('/api/v1/ai/stats');
      const json = await res.json();
      resetConfirmCount = json.data?.totalProcessed ?? 0;
    } catch {
      resetConfirmCount = 0;
    }
  }
</script>

<svelte:head>
  <title>Settings - Paperless NGX Dedupe</title>
</svelte:head>

<div class="space-y-8">
  <header class="space-y-1">
    <h1 class="text-ink text-2xl font-semibold tracking-tight">Settings</h1>
    <p class="text-muted mt-1">Configure Paperless-NGX connection and deduplication parameters.</p>
  </header>

  <!-- Sticky Mini-Nav -->
  <nav
    class="bg-canvas/80 sticky top-0 z-10 -mx-4 flex gap-1 rounded-lg px-4 py-2 backdrop-blur-sm sm:-mx-6 md:-mx-8"
  >
    <a
      href="#connection"
      class="text-muted hover:text-accent rounded-md px-3 py-1.5 text-sm font-medium">Connection</a
    >
    <a href="#dedup" class="text-muted hover:text-accent rounded-md px-3 py-1.5 text-sm font-medium"
      >Dedup Parameters</a
    >
    {#if data.aiEnabled}
      <a
        href="#ai-processing"
        class="text-muted hover:text-accent rounded-md px-3 py-1.5 text-sm font-medium"
        >AI Processing</a
      >
    {/if}
    {#if data.ragEnabled}
      <a
        href="#document-qa"
        class="text-muted hover:text-accent rounded-md px-3 py-1.5 text-sm font-medium"
        >Document Q&A</a
      >
    {/if}
    <a
      href="#system"
      class="text-muted hover:text-accent rounded-md px-3 py-1.5 text-sm font-medium">System</a
    >
    <a
      href="#backup"
      class="text-muted hover:text-accent rounded-md px-3 py-1.5 text-sm font-medium">Backup</a
    >
  </nav>

  <!-- Paperless-NGX Connection -->
  <div class="panel" id="connection">
    <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
      <Link class="text-accent h-5 w-5" />
      Paperless-NGX Connection
    </h2>
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
        {#if isTesting}
          <span class="flex items-center gap-2">
            <span
              class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            ></span>
            Testing...
          </span>
        {:else}
          Test Connection
        {/if}
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
  <div class="panel" id="dedup">
    <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
      <SlidersHorizontal class="text-accent h-5 w-5" />
      Deduplication Parameters
    </h2>

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
          <label for="w-jaccard" class="text-muted flex items-center gap-1.5 text-sm">
            Jaccard: <span class="text-ink font-mono font-medium">{weightJaccard}</span>
            <InfoIcon
              text="Measures structural overlap using MinHash fingerprints of word n-grams. Best for catching near-identical documents, OCR re-scans, or minor edits. A value of 0 disables this factor."
              position="top"
            />
          </label>
          <input
            id="w-jaccard"
            type="range"
            min="0"
            max="100"
            bind:value={weightJaccard}
            class="accent-accent mt-1 w-full"
          />
        </div>
        <div>
          <label for="w-fuzzy" class="text-muted flex items-center gap-1.5 text-sm">
            Fuzzy: <span class="text-ink font-mono font-medium">{weightFuzzy}</span>
            <InfoIcon
              text="Compares document text using character-level edit distance after sorting words. Resilient to paragraph reordering. Best for catching reworded sentences, different formatting, or OCR errors."
              position="top"
            />
          </label>
          <input
            id="w-fuzzy"
            type="range"
            min="0"
            max="100"
            bind:value={weightFuzzy}
            class="accent-accent mt-1 w-full"
          />
        </div>
      </div>

      <!-- Weight Budget Bar -->
      <div class="mt-4">
        <div class="flex h-3 overflow-hidden rounded-full">
          <div
            class="transition-all duration-200"
            style="width: {weightJaccard}%; background: oklch(0.55 0.15 195);"
            title="Jaccard: {weightJaccard}"
          ></div>
          <div
            class="transition-all duration-200"
            style="width: {weightFuzzy}%; background: oklch(0.6 0.16 155);"
            title="Fuzzy: {weightFuzzy}"
          ></div>
        </div>
        <div class="text-muted mt-1.5 flex gap-4 text-xs">
          <span class="flex items-center gap-1"
            ><span
              class="inline-block h-2 w-2 rounded-full"
              style="background: oklch(0.55 0.15 195)"
            ></span> Jaccard</span
          >
          <span class="flex items-center gap-1"
            ><span class="inline-block h-2 w-2 rounded-full" style="background: oklch(0.6 0.16 155)"
            ></span> Fuzzy</span
          >
        </div>
      </div>
    </div>

    <!-- Discriminative Penalty -->
    <div class="mt-6">
      <div class="flex items-center justify-between">
        <h3 class="text-ink text-sm font-medium">Discriminative Penalty</h3>
        <span class="text-ink font-mono text-sm font-medium">{penaltyStrength}%</span>
      </div>
      <div class="mt-3">
        <label for="w-penalty" class="text-muted flex items-center gap-1.5 text-sm">
          Strength: <span class="text-ink font-mono font-medium">{penaltyStrength}</span>
          <InfoIcon
            text="Controls how strongly the discriminative classifier reduces the confidence score when documents have different dates, amounts, invoice numbers, or routes. Targets false positives from template-based documents like monthly invoices, bank statements, and travel tickets."
            position="top"
          />
        </label>
        <input
          id="w-penalty"
          type="range"
          min="0"
          max="100"
          bind:value={penaltyStrength}
          class="accent-accent mt-1 w-full"
        />
        <div class="text-muted mt-2 space-y-1 text-xs">
          <p>
            <strong class="text-ink">Low (0-30%):</strong> Minimal impact. Template documents (e.g. monthly
            invoices with different dates) may still appear as duplicates.
          </p>
          <p>
            <strong class="text-ink">Medium (40-70%):</strong> Recommended. Catches most template-based
            false positives while keeping true duplicates intact.
          </p>
          <p>
            <strong class="text-ink">High (80-100%):</strong> Aggressive. Documents with any differing
            structured data are heavily penalized. May over-penalize minor OCR differences in dates or
            amounts.
          </p>
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
                text="Number of hash functions in the MinHash signature. More permutations = more accurate Jaccard estimates but slower processing. Must evenly divide by LSH Bands. Default: 256."
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
                text="Number of bands for Locality-Sensitive Hashing. More bands = more candidate pairs found (higher recall) but more comparisons to score. Must evenly divide Permutations. Default: 32."
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
                text="Maximum number of characters sampled from each document for fuzzy text comparison. Higher values are more accurate but slower. Default: 10,000."
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
    {#if analysisStale}
      <div class="mt-4">
        <StaleAnalysisBanner compact showRunButton={false} />
        <p class="text-muted mt-2 text-xs">
          Go to the <a href="/" class="text-accent hover:text-accent-hover underline">Dashboard</a>
          to re-run analysis with a full rebuild.
        </p>
      </div>
    {/if}
  </div>

  <!-- AI Processing Settings -->
  {#if data.aiEnabled}
    <div class="panel" id="ai-processing">
      <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
        <Brain class="text-accent h-5 w-5" />
        AI Processing
      </h2>

      <!-- Model Selection -->
      <div class="mt-4">
        <label for="ai-model" class="text-ink block text-sm font-medium">Model</label>
        <select
          id="ai-model"
          bind:value={aiModel}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none sm:w-64"
        >
          {#each aiModels as model (model.id)}
            <option value={model.id}>{model.name}</option>
          {/each}
        </select>
      </div>

      <!-- Reasoning Effort -->
      <div class="mt-4">
        <label
          for="ai-reasoning-effort"
          class="text-ink flex items-center gap-1.5 text-sm font-medium"
        >
          Reasoning Effort
          <InfoIcon
            text="Controls how much the model reasons before answering. 'Low' (default) is recommended — fast and cost-effective for classification. Higher levels increase thinking tokens which are billed as output tokens, potentially doubling costs at 'High'. 'None' disables reasoning entirely."
            position="bottom"
          />
        </label>
        <select
          id="ai-reasoning-effort"
          bind:value={aiReasoningEffort}
          class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none sm:w-64"
        >
          <option value="none">None</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <!-- Flex Processing -->
      <div class="mt-4 flex items-center gap-2">
        <label class="text-muted flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={aiFlexProcessing} class="rounded" />
          Flex Processing
        </label>
        <RichTooltip position="bottom">
          <svg
            class="text-muted hover:text-accent inline-block h-4 w-4 shrink-0 cursor-help transition-colors"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clip-rule="evenodd"
            />
          </svg>
          {#snippet content()}
            Uses OpenAI's Flex Processing for ~50% lower costs. Requests may take longer or be
            temporarily unavailable during high demand. Recommended for background processing.
            <a
              href="https://developers.openai.com/api/docs/guides/flex-processing"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-300 underline hover:text-blue-200">Learn more</a
            >
          {/snippet}
        </RichTooltip>
      </div>

      <!-- Auto-Process & Tag -->
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="flex items-center">
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiAutoProcess} class="rounded" />
            Auto-process new documents after sync
          </label>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiAddProcessedTag} class="rounded" />
            Add tag:
          </label>
          <input
            type="text"
            bind:value={aiProcessedTagName}
            disabled={!aiAddProcessedTag}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent w-40 rounded-lg border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div class="flex items-center gap-3">
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiProtectedTagsEnabled} class="rounded" />
            Protected tags:
          </label>
          <input
            type="text"
            bind:value={aiProtectedTagsInput}
            disabled={!aiProtectedTagsEnabled}
            placeholder="email, inbox"
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent w-64 rounded-lg border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none disabled:opacity-50"
          />
          <InfoIcon
            text="Tags listed here will never be added or removed by AI. If a document already has one of these tags (e.g. 'email' added by Paperless-NGX mail rules), it will be preserved. Comma-separated, case-insensitive."
            position="top"
          />
        </div>
      </div>

      <!-- Metadata Field Toggles -->
      <div class="border-soft mt-6 border-t pt-4">
        <h3 class="text-ink text-sm font-medium">Enabled Metadata Fields</h3>
        <p class="text-muted mt-1 text-xs">
          Control which metadata fields are active. Disabled fields are still extracted by the AI
          but will be ignored during review and never applied to documents.
        </p>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiExtractTitle} class="rounded" />
            Document Title
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiExtractCorrespondent} class="rounded" />
            Correspondent
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiExtractDocumentType} class="rounded" />
            Document Type
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiExtractTags} class="rounded" />
            Tags
          </label>
        </div>
      </div>

      <!-- Reference Data Toggles -->
      <div class="border-soft mt-6 border-t pt-4">
        <h3 class="text-ink text-sm font-medium">Include Existing Metadata in Prompt</h3>
        <p class="text-muted mt-1 text-xs">
          When enabled, existing names from your Paperless-NGX instance are included in the AI
          prompt to encourage reuse. When disabled, the AI creates metadata from scratch using
          built-in naming guidelines. Disable these if you have many correspondents, types, or tags
          to keep prompts small and costs low.
        </p>
        <div class="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiIncludeCorrespondents} class="rounded" />
            Correspondents
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiIncludeDocumentTypes} class="rounded" />
            Document Types
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiIncludeTags} class="rounded" />
            Tags
          </label>
        </div>
      </div>

      <!-- Prompt Template -->
      <div class="border-soft mt-6 border-t pt-4">
        <button
          onclick={() => (showPrompt = !showPrompt)}
          class="text-accent hover:text-accent-hover text-sm font-medium"
        >
          {showPrompt ? 'Hide' : 'Show'}
          {isDefaultPrompt ? '' : 'Custom '}Prompt Template
        </button>
        {#if !isDefaultPrompt && !showPrompt}
          <p class="text-warn mt-1 text-xs">Differs from recommended default</p>
        {/if}
        {#if showPrompt}
          <div class="mt-3 space-y-3">
            {#if !isDefaultPrompt}
              <div
                class="bg-warn-light text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
              >
                <AlertTriangle class="text-warn mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>
                    Your prompt template has been customised and differs from the latest recommended
                    default. Newer features may not work as expected.
                  </p>
                  <button
                    onclick={revertPrompt}
                    class="text-accent hover:text-accent-hover mt-2 text-xs font-medium"
                  >
                    Revert to Default
                  </button>
                </div>
              </div>
            {/if}
            {#if showRevertResetPrompt}
              <div
                class="bg-success-light text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
              >
                <Check class="text-success mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>
                    Prompt reverted to default. Reset processing history so documents can be
                    reprocessed with the updated prompt?
                  </p>
                  <div class="mt-2 flex gap-2">
                    <button
                      onclick={async () => {
                        showRevertResetPrompt = false;
                        await showResetConfirmation();
                      }}
                      class="text-accent hover:text-accent-hover text-xs font-medium"
                    >
                      Reset History
                    </button>
                    <button
                      onclick={() => {
                        showRevertResetPrompt = false;
                        aiSaveStatus = { type: 'success', message: 'Prompt reverted to default' };
                      }}
                      class="text-muted hover:text-ink text-xs font-medium"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            {/if}
            <textarea
              bind:value={aiPromptTemplate}
              rows="12"
              class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed focus:ring-1 focus:outline-none"
            ></textarea>
          </div>
        {/if}
      </div>

      <!-- Tag Alias Mapping -->
      <div class="border-soft mt-6 border-t pt-4">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              bind:checked={aiTagAliasesEnabled}
              class="accent-accent h-4 w-4 rounded"
            />
            <span class="text-ink text-sm font-medium">Enable Tag Alias Mapping</span>
          </label>
        </div>
        <p class="text-muted mt-1 text-xs">
          Maps variant tag names to canonical tags in the LLM prompt. When enabled, the alias map is
          included in the system prompt to normalise tag suggestions.
        </p>

        {#if aiTagAliasesEnabled}
          <div class="mt-3">
            <button
              onclick={() => (showTagAliases = !showTagAliases)}
              class="text-accent hover:text-accent-hover text-sm font-medium"
            >
              {showTagAliases ? 'Hide' : 'Show'}
              {isDefaultTagAliasMap ? '' : 'Custom '}Tag Alias Map
            </button>
            {#if !isDefaultTagAliasMap && !showTagAliases}
              <p class="text-warn mt-1 text-xs">Differs from recommended default</p>
            {/if}
            {#if showTagAliases}
              <div class="mt-3 space-y-3">
                {#if !isDefaultTagAliasMap}
                  <div
                    class="bg-warn-light text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
                  >
                    <AlertTriangle class="text-warn mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p>
                        Your tag alias map has been customised and differs from the latest
                        recommended default.
                      </p>
                      <button
                        onclick={revertTagAliases}
                        class="text-accent hover:text-accent-hover mt-2 text-xs font-medium"
                      >
                        Revert to Default
                      </button>
                    </div>
                  </div>
                {/if}
                {#if showRevertResetTagAliases}
                  <div
                    class="bg-success-light text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
                  >
                    <Check class="text-success mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p>
                        Tag alias map reverted to default. Reset processing history so documents can
                        be reprocessed with the updated aliases?
                      </p>
                      <div class="mt-2 flex gap-2">
                        <button
                          onclick={async () => {
                            showRevertResetTagAliases = false;
                            await showResetConfirmation();
                          }}
                          class="text-accent hover:text-accent-hover text-xs font-medium"
                        >
                          Reset History
                        </button>
                        <button
                          onclick={() => {
                            showRevertResetTagAliases = false;
                            aiSaveStatus = {
                              type: 'success',
                              message: 'Tag alias map reverted to default',
                            };
                          }}
                          class="text-muted hover:text-ink text-xs font-medium"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                {/if}
                <textarea
                  bind:value={aiTagAliasMap}
                  rows="16"
                  class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed focus:ring-1 focus:outline-none {tagAliasValidationError
                    ? 'border-red-500'
                    : ''}"
                ></textarea>
                {#if tagAliasValidationError}
                  <p class="text-xs text-red-600">{tagAliasValidationError}</p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Reset Processing History -->
      <div class="border-soft mt-4 border-t pt-4">
        {#if resetConfirmCount !== null}
          <div class="bg-ember-light text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm">
            <AlertTriangle class="text-ember mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>
                This will delete {resetConfirmCount} AI processing result{resetConfirmCount === 1
                  ? ''
                  : 's'}. Documents will become eligible for reprocessing. This cannot be undone.
              </p>
              <div class="mt-2 flex gap-2">
                <button
                  onclick={resetProcessingHistory}
                  disabled={isResetting}
                  class="bg-ember hover:bg-ember/90 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                >
                  {isResetting ? 'Resetting...' : 'Confirm Reset'}
                </button>
                <button
                  onclick={() => (resetConfirmCount = null)}
                  class="text-muted hover:text-ink text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        {:else}
          <button
            onclick={showResetConfirmation}
            class="text-ember hover:text-ember/80 text-sm font-medium"
          >
            Reset Processing History
          </button>
          <p class="text-muted mt-1 text-xs">
            Delete all AI results so documents can be reprocessed.
          </p>
        {/if}
      </div>

      <!-- Advanced AI Settings -->
      <div class="border-soft mt-4 border-t pt-4">
        <button
          onclick={() => (showAiAdvanced = !showAiAdvanced)}
          class="text-accent hover:text-accent-hover text-sm font-medium"
        >
          {showAiAdvanced ? 'Hide' : 'Show'} Advanced Settings
        </button>
        {#if showAiAdvanced}
          <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label for="ai-max-content" class="text-muted flex items-center gap-1.5 text-sm">
                Max Content Length
                <InfoIcon
                  text="Maximum number of characters (not tokens) sent to the AI per document. Documents longer than this are truncated, keeping the first 60% and last 40%. Default 8,000 chars (~2,000 tokens) balances accuracy with cost. Increase for long documents but be aware this directly increases token usage and cost."
                  position="top"
                />
              </label>
              <input
                id="ai-max-content"
                type="number"
                min="500"
                max="100000"
                bind:value={aiMaxContentLength}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label for="ai-batch" class="text-muted flex items-center gap-1.5 text-sm">
                Concurrency
                <InfoIcon
                  text="Number of documents processed in parallel. Documents are sent to the AI provider concurrently up to this limit. Default: 10."
                  position="top"
                />
              </label>
              <input
                id="ai-batch"
                type="number"
                min="1"
                max="100"
                bind:value={aiBatchSize}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label for="ai-delay" class="text-muted flex items-center gap-1.5 text-sm">
                Rate Delay (ms)
                <InfoIcon
                  text="Milliseconds between launching each AI request. Set to 0 for auto-pacing based on your provider's rate limits at 85% utilization. Default: 0 (auto)."
                  position="top"
                />
              </label>
              <input
                id="ai-delay"
                type="number"
                min="0"
                max="60000"
                bind:value={aiRateDelayMs}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label for="ai-retries" class="text-muted flex items-center gap-1.5 text-sm">
                Max Retries
                <InfoIcon
                  text="Number of automatic retries when an AI request fails (e.g., network error or rate limit). The SDK handles exponential backoff between retries. Default: 3. Set to 0 to disable retries."
                  position="top"
                />
              </label>
              <input
                id="ai-retries"
                type="number"
                min="0"
                max="10"
                bind:value={aiMaxRetries}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
          </div>
        {/if}
      </div>

      <!-- Confidence Thresholds -->
      <div class="border-soft mt-4 border-t pt-4">
        <h3 class="text-ink text-sm font-semibold">Confidence Thresholds</h3>
        <p class="text-muted mt-1 text-xs">
          Set minimum confidence scores for auto-apply eligibility. Results below these thresholds
          will require manual review.
        </p>

        <div class="mt-3">
          <label for="ai-conf-global" class="text-muted flex items-center gap-1.5 text-sm">
            Global Minimum
            <InfoIcon
              text="Results with any field below this confidence are never auto-applied. Set to 0 to disable the global gate."
              position="top"
            />
          </label>
          <div class="mt-1 flex items-center gap-3">
            <input
              id="ai-conf-global"
              type="range"
              min="0"
              max="100"
              bind:value={aiConfidenceGlobal}
              class="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-blue-500 dark:bg-zinc-700"
            />
            <span class="text-ink w-12 text-right text-sm font-medium">{aiConfidenceGlobal}%</span>
          </div>
        </div>

        <button
          onclick={() => (showConfidenceFields = !showConfidenceFields)}
          class="text-accent hover:text-accent-hover mt-3 text-sm font-medium"
        >
          {showConfidenceFields ? 'Hide' : 'Show'} Per-Field Thresholds
        </button>
        {#if showConfidenceFields}
          <div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label for="ai-conf-title" class="text-muted text-sm">Title</label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  id="ai-conf-title"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceTitle}
                  class="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-blue-500 dark:bg-zinc-700"
                />
                <span class="text-ink w-12 text-right text-sm">{aiConfidenceTitle}%</span>
              </div>
            </div>
            <div>
              <label for="ai-conf-corr" class="text-muted text-sm">Correspondent</label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  id="ai-conf-corr"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceCorrespondent}
                  class="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-blue-500 dark:bg-zinc-700"
                />
                <span class="text-ink w-12 text-right text-sm">{aiConfidenceCorrespondent}%</span>
              </div>
            </div>
            <div>
              <label for="ai-conf-type" class="text-muted text-sm">Document Type</label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  id="ai-conf-type"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceDocType}
                  class="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-blue-500 dark:bg-zinc-700"
                />
                <span class="text-ink w-12 text-right text-sm">{aiConfidenceDocType}%</span>
              </div>
            </div>
            <div>
              <label for="ai-conf-tags" class="text-muted text-sm">Tags</label>
              <div class="mt-1 flex items-center gap-2">
                <input
                  id="ai-conf-tags"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceTags}
                  class="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-blue-500 dark:bg-zinc-700"
                />
                <span class="text-ink w-12 text-right text-sm">{aiConfidenceTags}%</span>
              </div>
            </div>
          </div>
          <p class="text-muted mt-2 text-xs">
            Per-field thresholds override the global minimum upward. The effective threshold for
            each field is the higher of the two.
          </p>
        {/if}

        <div class="mt-4 space-y-2">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiNeverAutoCreate} class="accent-blue-500" />
            <span class="text-ink">Never auto-create new entities</span>
            <InfoIcon
              text="Prevents auto-apply from creating correspondents, document types, or tags that don't already exist in Paperless-NGX."
              position="top"
            />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiNeverOverwrite} class="accent-blue-500" />
            <span class="text-ink">Never overwrite existing non-empty fields</span>
            <InfoIcon
              text="Prevents auto-apply from changing a field that already has a value in Paperless-NGX."
              position="top"
            />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={aiTagsOnly} class="accent-blue-500" />
            <span class="text-ink">Tags-only auto-apply mode</span>
            <InfoIcon
              text="Restricts auto-apply to only modify tags, leaving correspondent and document type untouched."
              position="top"
            />
          </label>
        </div>
      </div>

      <!-- Auto-Apply Rules -->
      <div class="border-soft mt-4 border-t pt-4">
        <h3 class="text-ink text-sm font-semibold">Auto-Apply Rules</h3>
        <p class="text-muted mt-1 text-xs">
          Automatically apply AI suggestions that meet all criteria below. Results that don't
          qualify remain in the review queue.
        </p>

        <label class="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={aiAutoApply} class="accent-blue-500" />
          <span class="text-ink font-medium">Enable auto-apply after processing</span>
        </label>

        {#if aiAutoApply}
          <div
            class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
          >
            Auto-apply will modify documents in Paperless-NGX without manual review. Ensure your
            confidence thresholds are set appropriately.
          </div>

          <div class="mt-3 space-y-2 pl-6">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                bind:checked={aiAutoApplyRequireThreshold}
                class="accent-blue-500"
              />
              <span class="text-ink">All fields above their confidence threshold</span>
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                bind:checked={aiAutoApplyRequireNoNew}
                class="accent-blue-500"
              />
              <span class="text-ink">No new entities would be created</span>
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                bind:checked={aiAutoApplyRequireNoClearing}
                class="accent-blue-500"
              />
              <span class="text-ink">No existing values would be cleared</span>
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" bind:checked={aiAutoApplyRequireOcr} class="accent-blue-500" />
              <span class="text-ink">Document has OCR text</span>
            </label>
          </div>
        {/if}
      </div>

      <!-- Save Button -->
      <div class="mt-6 flex items-center gap-3">
        <button
          onclick={saveAiConfig}
          disabled={isSavingAi}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSavingAi ? 'Saving...' : 'Save AI Configuration'}
        </button>
      </div>
      {#if aiSaveStatus}
        <div
          class="mt-3 rounded-lg px-3 py-2 text-sm {aiSaveStatus.type === 'success'
            ? 'bg-success-light text-success'
            : 'bg-ember-light text-ember'}"
        >
          {aiSaveStatus.message}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Document Q&A Settings -->
  {#if data.ragEnabled}
    <div class="panel" id="document-qa">
      <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
        <MessageCircleQuestion class="text-accent h-5 w-5" />
        Document Q&A
      </h2>

      <!-- Embedding Model -->
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label for="rag-embed-model" class="text-ink block text-sm font-medium">
            Embedding Model
          </label>
          <select
            id="rag-embed-model"
            bind:value={ragEmbeddingModel}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
          >
            <option value="text-embedding-3-small">text-embedding-3-small (1536d, cheaper)</option>
            <option value="text-embedding-3-large"
              >text-embedding-3-large (3072d, higher quality)</option
            >
          </select>
        </div>
        <div>
          <label for="rag-embed-dims" class="text-muted flex items-center gap-1.5 text-sm">
            Embedding Dimensions
            <InfoIcon
              text="Number of dimensions for the embedding vectors. Lower values save storage and are faster. Default: 1536 for small, 3072 for large."
              position="top"
            />
          </label>
          <input
            id="rag-embed-dims"
            type="number"
            min="256"
            max="3072"
            bind:value={ragEmbeddingDimensions}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
          />
        </div>
      </div>

      <!-- Answer Model -->
      <div class="border-soft mt-6 border-t pt-4">
        <h3 class="text-ink text-sm font-medium">Answer Model</h3>
        <p class="text-muted mt-1 text-xs">
          The AI model used to generate answers from retrieved document context. Independent from
          the AI Processing model.
        </p>
        <div class="mt-3">
          <label for="rag-model" class="text-ink block text-sm font-medium">Model</label>
          <select
            id="rag-model"
            bind:value={ragAnswerModel}
            class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none sm:w-64"
          >
            {#each ragModels as model (model.id)}
              <option value={model.id}>{model.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Auto-Index & Retrieval -->
      <div class="border-soft mt-6 border-t pt-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex items-center">
            <label class="text-muted flex items-center gap-2 text-sm">
              <input type="checkbox" bind:checked={ragAutoIndex} class="rounded" />
              Auto-index documents after sync
            </label>
          </div>
        </div>
      </div>

      <!-- Advanced Settings -->
      <div class="border-soft mt-4 border-t pt-4">
        <button
          onclick={() => (showRagAdvanced = !showRagAdvanced)}
          class="text-accent hover:text-accent-hover text-sm font-medium"
        >
          {showRagAdvanced ? 'Hide' : 'Show'} Advanced Settings
        </button>
        {#if showRagAdvanced}
          <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label for="rag-chunk-size" class="text-muted flex items-center gap-1.5 text-sm">
                Chunk Size (tokens)
                <InfoIcon
                  text="Number of tokens per document chunk. Smaller chunks give more precise retrieval but may lose context. Default: 400."
                  position="top"
                />
              </label>
              <input
                id="rag-chunk-size"
                type="number"
                min="100"
                max="2000"
                bind:value={ragChunkSize}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label for="rag-overlap" class="text-muted flex items-center gap-1.5 text-sm">
                Chunk Overlap (tokens)
                <InfoIcon
                  text="Token overlap between consecutive chunks. Prevents information loss at chunk boundaries. Default: 40."
                  position="top"
                />
              </label>
              <input
                id="rag-overlap"
                type="number"
                min="0"
                max="500"
                bind:value={ragChunkOverlap}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label for="rag-topk" class="text-muted flex items-center gap-1.5 text-sm">
                Top-K Results
                <InfoIcon
                  text="Number of document chunks retrieved per query. More chunks provide broader context but increase token usage. Default: 20."
                  position="top"
                />
              </label>
              <input
                id="rag-topk"
                type="number"
                min="1"
                max="100"
                bind:value={ragTopK}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
            <div>
              <label for="rag-context" class="text-muted flex items-center gap-1.5 text-sm">
                Max Context Tokens
                <InfoIcon
                  text="Maximum number of tokens from retrieved chunks included in the prompt to the answer model. Default: 8000."
                  position="top"
                />
              </label>
              <input
                id="rag-context"
                type="number"
                min="500"
                max="100000"
                bind:value={ragMaxContextTokens}
                class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
              />
            </div>
          </div>
        {/if}
      </div>

      <!-- System Prompt -->
      <div class="border-soft mt-4 border-t pt-4">
        <button
          onclick={() => (showRagPrompt = !showRagPrompt)}
          class="text-accent hover:text-accent-hover text-sm font-medium"
        >
          {showRagPrompt ? 'Hide' : 'Show'} System Prompt
        </button>
        {#if showRagPrompt}
          <div class="mt-3">
            <textarea
              bind:value={ragSystemPrompt}
              rows="8"
              class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed focus:ring-1 focus:outline-none"
            ></textarea>
          </div>
        {/if}
      </div>

      <!-- Index Status -->
      {#if ragStats}
        <div class="border-soft mt-6 border-t pt-4">
          <h3 class="text-ink text-sm font-medium">Index Status</h3>
          <div class="text-muted mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <span class="text-muted text-xs">Indexed Documents</span>
              <p class="text-ink font-medium">
                {ragStats.indexedDocuments} / {ragStats.indexedDocuments +
                  ragStats.unindexedDocuments}
              </p>
            </div>
            <div>
              <span class="text-muted text-xs">Total Chunks</span>
              <p class="text-ink font-medium">{ragStats.totalChunks.toLocaleString()}</p>
            </div>
            <div>
              <span class="text-muted text-xs">Last Indexed</span>
              <p class="text-ink font-medium">
                {ragStats.lastIndexedAt
                  ? new Date(ragStats.lastIndexedAt).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          </div>
          {#if ragStats.indexCost}
            <div class="mt-3 rounded-lg px-3 py-2 text-sm" style="background: oklch(0.95 0.02 85);">
              <span class="text-ink">
                Indexing {ragStats.unindexedDocuments} unindexed document{ragStats.unindexedDocuments ===
                1
                  ? ''
                  : 's'}: ~{(ragStats.indexCost.estimatedTokens / 1000).toFixed(0)}K tokens,
                estimated
                <strong
                  >~${ragStats.indexCost.estimatedCostUsd < 0.01
                    ? '<0.01'
                    : ragStats.indexCost.estimatedCostUsd.toFixed(2)}</strong
                >
              </span>
            </div>
          {/if}
          {#if ragStats.rebuildCost}
            <div class="text-muted mt-2 text-xs">
              Full rebuild (all documents): ~{(ragStats.rebuildCost.estimatedTokens / 1000).toFixed(
                0,
              )}K tokens, ~${ragStats.rebuildCost.estimatedCostUsd < 0.01
                ? '<0.01'
                : ragStats.rebuildCost.estimatedCostUsd.toFixed(2)}
            </div>
          {/if}
          <button
            onclick={rebuildRagIndex}
            disabled={isRagIndexing}
            class="border-soft text-ink hover:bg-canvas mt-3 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {isRagIndexing ? 'Rebuilding...' : 'Rebuild Index'}
          </button>
        </div>
      {/if}

      <!-- Save Button -->
      <div class="mt-6 flex items-center gap-3">
        <button
          onclick={saveRagConfig}
          disabled={isSavingRag}
          class="bg-accent hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSavingRag ? 'Saving...' : 'Save Q&A Configuration'}
        </button>
      </div>
      {#if ragSaveStatus}
        <div
          class="mt-3 rounded-lg px-3 py-2 text-sm {ragSaveStatus.type === 'success'
            ? 'bg-success-light text-success'
            : 'bg-ember-light text-ember'}"
        >
          {ragSaveStatus.message}
        </div>
      {/if}
    </div>
  {/if}

  <!-- System Information -->
  <div class="panel" id="system">
    <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
      <Info class="text-accent h-5 w-5" />
      System Information
    </h2>
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
        <dt class="text-muted text-sm">Pending Groups</dt>
        <dd class="text-ink mt-0.5 text-sm font-medium">
          {system.duplicateGroups.toLocaleString()}
        </dd>
      </div>
    </dl>
  </div>

  <!-- Backup & Restore -->
  <div class="panel" id="backup">
    <h2 class="text-ink flex items-center gap-2 text-lg font-semibold">
      <Archive class="text-accent h-5 w-5" />
      Backup & Restore
    </h2>
    <div class="mt-4 space-y-4">
      <div>
        <h3 class="text-ink text-sm font-medium">Export Configuration</h3>
        <p class="text-muted mt-1 text-xs">
          Download a backup of all settings and dedup parameters.
        </p>
        <a
          href="/api/v1/export/config.json"
          download
          onclick={() => trackConfigExported()}
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
