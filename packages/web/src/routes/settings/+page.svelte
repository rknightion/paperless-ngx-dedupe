<script lang="ts">
  import PrimaryStrategySelect from '$lib/components/duplicates/PrimaryStrategySelect.svelte';
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import {
    Button,
    Checkbox,
    InfoIcon,
    RichTooltip,
    Select,
    StaleAnalysisBanner,
    Tabs,
    TextField,
  } from '$lib/components';
  import {
    trackSettingsSaved,
    trackConnectionTested,
    trackConfigExported,
    trackConfigImported,
  } from '$lib/faro-events';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import { parse as parseYaml } from 'yaml';
  import AutomationSettings from '$lib/components/settings/AutomationSettings.svelte';
  import RememberedDecisions from '$lib/components/settings/RememberedDecisions.svelte';
  import WebhookSyncSettings from '$lib/components/settings/WebhookSyncSettings.svelte';
  import DecisionBackup from '$lib/components/settings/DecisionBackup.svelte';
  import DatabaseBackupSettings from '$lib/components/settings/DatabaseBackupSettings.svelte';
  import DiagnosticsSettings from '$lib/components/settings/DiagnosticsSettings.svelte';
  import CustomFieldPolicySettings from '$lib/components/settings/CustomFieldPolicySettings.svelte';

  const reasoningEffortOptions = [
    { value: 'none', label: 'None' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  /** Validate YAML string as a tag alias map (Record<string, string[]>). */
  function validateTagAliasYaml(yaml: string): { valid: boolean; error?: string } {
    if (yaml.trim() === '') return { valid: true };
    let parsed: unknown;
    try {
      parsed = parseYaml(yaml);
    } catch (e) {
      return { valid: false, error: `Invalid YAML syntax: ${(e as Error).message}` };
    }
    if (parsed === null || parsed === undefined) return { valid: true };
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, error: 'Tag alias map must be a mapping of tag names to alias lists' };
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) {
        return { valid: false, error: `"${key}" must map to an array of aliases` };
      }
      if (!value.every((item) => typeof item === 'string')) {
        return { valid: false, error: `"${key}" aliases must all be strings` };
      }
    }
    return { valid: true };
  }

  // Status lines: a shape (generated content, so the message text is unchanged), the
  // semantic colour and a left rule. No tinted box.
  const statusClasses = {
    success: "border-success text-success before:content-['■_']",
    error: "border-ember text-ember before:content-['●_']",
  } as const;

  let { data } = $props();
  type SettingsSection = 'connection' | 'automation' | 'dedup' | 'ai' | 'system';
  let activeSettingsSection = $state<SettingsSection>('connection');

  const initialDedup = untrack(() => data.dedupConfig);

  // Derived read-only system info (tracks data changes from invalidateAll)
  let system = $derived(data.system);

  let connectionStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
  let isTesting = $state(false);

  // Dedup settings - use $state for form binding
  let primaryStrategy = $state(initialDedup.primaryStrategy);
  let threshold = $state(Math.round(initialDedup.similarityThreshold * 100));
  let weightJaccard = $state(initialDedup.confidenceWeightJaccard);
  let weightFuzzy = $state(initialDedup.confidenceWeightFuzzy);
  let penaltyStrength = $state(initialDedup.discriminativePenaltyStrength);
  let numPermutations = $state(initialDedup.numPermutations);
  let numBands = $state(initialDedup.numBands);
  let ngramSize = $state(initialDedup.ngramSize);
  let minWords = $state(initialDedup.minWords);
  let fuzzySampleSize = $state(initialDedup.fuzzySampleSize);
  let excludedTagNamesInput = $state(initialDedup.excludedTagNames.join('\n'));
  // Deprecated and ignored; preserve the stored key for config compatibility.
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
  let aiModel = $state(initialAiConfig?.model ?? 'gpt-6-luna');
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
  let aiExtractCustomFields = $state(initialAiConfig?.extractCustomFields ?? false);
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
  let showConfidenceFields = $state(false);

  let weightSum = $derived(weightJaccard + weightFuzzy);
  let weightsValid = $derived(weightSum === 100);

  const settingsTabs = $derived([
    { value: 'connection', label: 'Connection' },
    { value: 'dedup', label: 'Deduplication' },
    ...(data.aiEnabled ? [{ value: 'ai', label: 'AI Processing' }] : []),
    { value: 'automation', label: 'Automation' },
    { value: 'system', label: 'System & backup' },
  ]);

  async function testConnection() {
    isTesting = true;
    connectionStatus = null;
    try {
      const res = await fetch('/api/v1/config/test-connection', {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok && json.data?.connected) {
        trackConnectionTested(true);
        connectionStatus = {
          type: 'success',
          message: `Connected! Paperless v${json.data.version} - ${json.data.documentCount} documents`,
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
          primaryStrategy,
          similarityThreshold: threshold / 100,
          confidenceWeightJaccard: weightJaccard,
          confidenceWeightFuzzy: weightFuzzy,
          discriminativePenaltyStrength: penaltyStrength,
          numPermutations,
          numBands,
          ngramSize,
          minWords,
          fuzzySampleSize,
          excludedTagNames: excludedTagNamesInput
            .split(/\r?\n/)
            .map((name) => name.trim())
            .filter(Boolean),
          autoAnalyze,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        trackSettingsSaved('dedup');
        const meta = json.meta;
        let msg = 'Configuration saved';
        if (meta?.recalculatedGroups !== undefined) {
          msg += ` - ${meta.recalculatedGroups} groups recalculated`;
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
    // Validate tag alias YAML before saving (always validate - server rejects invalid YAML regardless of toggle)
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
          extractCustomFields: aiExtractCustomFields,
          confidenceThresholdGlobal: aiConfidenceGlobal / 100,
          confidenceThresholdTitle: aiConfidenceTitle / 100,
          confidenceThresholdCorrespondent: aiConfidenceCorrespondent / 100,
          confidenceThresholdDocumentType: aiConfidenceDocType / 100,
          confidenceThresholdTags: aiConfidenceTags / 100,
          protectedTagsEnabled: aiProtectedTagsEnabled,
          protectedTagNames: aiProtectedTagsInput
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0),
          tagAliasesEnabled: aiTagAliasesEnabled,
          tagAliasMap: aiTagAliasMap,
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

<div class="space-y-6">
  <header class="space-y-1">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-ink text-xl font-semibold">Settings</h1>
      <span class="text-muted font-mono text-xs">/settings</span>
    </div>
    <p class="text-muted text-sm">
      Configure Paperless-NGX connection and deduplication parameters.
    </p>
  </header>

  {#if !data.accessProtectionEnabled}
    <aside role="note" aria-label="Access protection" class="border-border bg-surface border p-4">
      <h2 class="text-ink text-sm font-semibold">Not protected</h2>
      <p class="text-muted mt-1 text-sm">
        Application access protection is off. Anyone who can reach this app can view and change
        documents. Keep it on a trusted network or behind an authenticating proxy, or enable access
        protection.
      </p>
      <a
        class="text-accent mt-2 inline-block text-sm underline"
        href="https://github.com/rknightion/paperless-ngx-dedupe/blob/main/docs/security.md#access-model"
        target="_blank"
        rel="noopener noreferrer"
      >
        Learn about access protection
      </a>
    </aside>
  {/if}

  <!-- Sticky section nav on a solid canvas fill. -->
  <div class="bg-canvas sticky top-0 z-10 -mx-3 px-3 py-2 md:-mx-6 md:px-6">
    <Tabs
      tabs={settingsTabs}
      active={activeSettingsSection}
      ariaLabel="Settings sections"
      onchange={(v) => (activeSettingsSection = v as SettingsSection)}
    />
  </div>

  <!-- Paperless-NGX Connection -->
  <div class="panel" id="connection" class:hidden={activeSettingsSection !== 'connection'}>
    <h2 class="text-ink text-lg font-semibold">Paperless-NGX Connection</h2>
    <p class="text-muted mt-2 text-sm">Connection settings are managed by environment variables.</p>
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <TextField
        id="paperless-url"
        label="URL"
        type="url"
        value={data.connection.url}
        readonly
        class="sm:col-span-2"
      />
      <div class="sm:col-span-2">
        <p class="text-muted text-xs">
          Authentication: {data.connection.apiToken.configured ||
          (data.connection.username.configured && data.connection.password.configured)
            ? 'configured'
            : 'not configured'}
        </p>
      </div>
    </div>
    <div class="mt-4 flex items-center gap-3">
      <Button onclick={testConnection} loading={isTesting} disabled={!data.connection.url}>
        {isTesting ? 'Testing...' : 'Test Connection'}
      </Button>
    </div>
    {#if connectionStatus}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class="mt-3 border-l-2 py-1 pl-3 text-sm {statusClasses[connectionStatus.type]}"
      >
        {connectionStatus.message}
      </div>
    {/if}
  </div>

  <div id="automation" class:hidden={activeSettingsSection !== 'automation'}>
    <AutomationSettings settings={data.automation} />
    <WebhookSyncSettings settings={data.webhookSync} />
  </div>

  <!-- Dedup Parameters -->
  <div class="panel" id="dedup" class:hidden={activeSettingsSection !== 'dedup'}>
    <h2 class="text-ink text-lg font-semibold">Deduplication Parameters</h2>

    <div class="mt-4">
      <div class="mb-5">
        <PrimaryStrategySelect bind:value={primaryStrategy} disabled={isSavingDedup} />
        <p class="text-muted mt-2 text-sm">
          Applies to newly created groups. Existing keepers change only when you apply a rule in the
          bulk wizard.
        </p>
      </div>
      <label for="excluded-tag-names" class="text-ink block text-sm font-medium">
        Exclude documents with tags
      </label>
      <!-- Native textarea: no multi-line primitive exists in the component set. -->
      <textarea
        id="excluded-tag-names"
        bind:value={excludedTagNamesInput}
        rows="3"
        class="border-border-hover bg-surface-raised text-ink mt-2 w-full rounded-sm border px-3 py-2 text-sm"
        aria-describedby="excluded-tag-help"></textarea>
      <p id="excluded-tag-help" class="text-muted mt-1 text-xs">
        One tag name per line. Matching ignores case. These documents stay in Paperless and are
        skipped by analysis.
      </p>
    </div>

    <!-- Similarity Threshold -->
    <div class="mt-4">
      <label for="threshold" class="text-ink block text-sm font-medium">
        Similarity Threshold: <span class="font-mono">{threshold}%</span>
      </label>
      <!-- Native range slider: no slider primitive exists in the component set. -->
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
          <!-- Native range slider: no slider primitive exists in the component set. -->
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
          <!-- Native range slider: no slider primitive exists in the component set. -->
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
        <div class="flex h-1.5 overflow-hidden">
          <!-- Two data series, so the first two chart tokens rather than the
               accent - this is a composition readout, not an action. -->
          <div
            class="transition-all duration-200"
            style="width: {weightJaccard}%; background: var(--color-chart-1);"
            title="Jaccard: {weightJaccard}"
          ></div>
          <div
            class="transition-all duration-200"
            style="width: {weightFuzzy}%; background: var(--color-chart-2);"
            title="Fuzzy: {weightFuzzy}"
          ></div>
        </div>
        <div class="text-muted mt-1.5 flex gap-4 text-xs">
          <span class="flex items-center gap-1">
            <span class="inline-block h-2 w-2 rounded-full" style="background: var(--color-chart-1)"
            ></span> Jaccard
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block h-2 w-2 rounded-full" style="background: var(--color-chart-2)"
            ></span> Fuzzy
          </span>
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
        <!-- Native range slider: no slider primitive exists in the component set. -->
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
      <!-- Native button: text-link disclosure toggle; Button has no link variant. -->
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
            <TextField
              id="num-perms"
              type="number"
              min={16}
              max={1024}
              class="mt-1"
              bind:value={numPermutations}
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
            <TextField
              id="num-bands"
              type="number"
              min={1}
              max={100}
              class="mt-1"
              bind:value={numBands}
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
            <TextField
              id="ngram-size"
              type="number"
              min={1}
              max={10}
              class="mt-1"
              bind:value={ngramSize}
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
            <TextField
              id="min-words"
              type="number"
              min={1}
              max={1000}
              class="mt-1"
              bind:value={minWords}
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
            <TextField
              id="fuzzy-sample"
              type="number"
              min={100}
              max={100000}
              class="mt-1"
              bind:value={fuzzySampleSize}
            />
          </div>
          <p class="text-muted text-sm">
            To run analysis after each sync, enable the Analysis schedule under
            <a
              href="#automation"
              class="text-accent hover:text-accent-hover underline"
              onclick={() => (activeSettingsSection = 'automation')}
            >
              Automation
            </a>.
          </p>
        </div>
      {/if}
    </div>

    <!-- Save Button -->
    <div class="mt-6 flex items-center gap-3">
      <Button
        onclick={saveDedupConfig}
        disabled={!weightsValid || isSavingDedup}
        describedBy={!weightsValid ? 'dedup-weights-error' : undefined}
      >
        {isSavingDedup ? 'Saving...' : 'Save Configuration'}
      </Button>
      {#if !weightsValid}
        <span id="dedup-weights-error" class="text-ember text-sm">Weights must sum to 100</span>
      {/if}
    </div>
    {#if dedupSaveStatus}
      <div class="mt-3 border-l-2 py-1 pl-3 text-sm {statusClasses[dedupSaveStatus.type]}">
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

  {#if activeSettingsSection === 'dedup'}
    <RememberedDecisions />
  {/if}

  <!-- AI Processing Settings -->
  {#if data.aiEnabled}
    <div class="panel" id="ai-processing" class:hidden={activeSettingsSection !== 'ai'}>
      <h2 class="text-ink text-lg font-semibold">AI Processing</h2>

      <!-- Model Selection -->
      <div class="mt-4">
        <Select
          id="ai-model"
          label="Model"
          options={aiModels.map((model) => ({ value: model.id, label: model.name }))}
          bind:value={aiModel}
          class="w-full sm:w-64"
        />
      </div>

      <!-- Reasoning Effort -->
      <div class="mt-4">
        <label
          for="ai-reasoning-effort"
          class="text-ink flex items-center gap-1.5 text-sm font-medium"
        >
          Reasoning Effort
          <InfoIcon
            text="Controls how much the model reasons before answering. 'Low' (default) is recommended - fast and cost-effective for classification. Higher levels increase thinking tokens which are billed as output tokens, potentially doubling costs at 'High'. 'None' disables reasoning entirely."
            position="bottom"
          />
        </label>
        <Select
          id="ai-reasoning-effort"
          options={reasoningEffortOptions}
          bind:value={aiReasoningEffort}
          class="mt-1 w-full sm:w-64"
        />
      </div>

      <!-- Flex Processing -->
      <div class="mt-4 flex items-center gap-2">
        <label class="text-muted flex items-center gap-2 text-sm">
          <Checkbox bind:checked={aiFlexProcessing} />
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
              class="text-on-inverse hover:text-on-inverse/80 underline"
            >
              Learn more
            </a>
          {/snippet}
        </RichTooltip>
      </div>

      <!-- Processed tag -->
      <div class="mt-4">
        <div class="flex items-center gap-3">
          <label class="text-muted flex items-center gap-2 text-sm">
            <Checkbox bind:checked={aiAddProcessedTag} />
            Add tag:
          </label>
          <TextField
            ariaLabel="Processed tag name"
            bind:value={aiProcessedTagName}
            disabled={!aiAddProcessedTag}
            class="w-40"
          />
        </div>
        <div class="flex items-center gap-3">
          <label class="text-muted flex items-center gap-2 text-sm">
            <Checkbox bind:checked={aiProtectedTagsEnabled} />
            Protected tags:
          </label>
          <TextField
            bind:value={aiProtectedTagsInput}
            disabled={!aiProtectedTagsEnabled}
            placeholder="email, inbox"
            class="w-64"
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
            <Checkbox bind:checked={aiExtractTitle} />
            Document Title
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <Checkbox bind:checked={aiExtractCorrespondent} />
            Correspondent
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <Checkbox bind:checked={aiExtractDocumentType} />
            Document Type
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <Checkbox bind:checked={aiExtractTags} />
            Tags
          </label>
          <CustomFieldPolicySettings bind:enabled={aiExtractCustomFields} />
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
            <Checkbox bind:checked={aiIncludeCorrespondents} />
            Correspondents
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <Checkbox bind:checked={aiIncludeDocumentTypes} />
            Document Types
          </label>
          <label class="text-muted flex items-center gap-2 text-sm">
            <Checkbox bind:checked={aiIncludeTags} />
            Tags
          </label>
        </div>
      </div>

      <!-- Prompt Template -->
      <div class="border-soft mt-6 border-t pt-4">
        <!-- Native button: text-link disclosure toggle; Button has no link variant. -->
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
              <div class="border-warn text-ink flex items-start gap-3 border-l-2 py-1 pl-3 text-sm">
                <WarningIcon class="text-warn mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>
                    Your prompt template has been customised and differs from the latest recommended
                    default. Newer features may not work as expected.
                  </p>
                  <!-- Native button: text-link action; Button has no link variant. -->
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
                class="border-success text-ink flex items-start gap-3 border-l-2 py-1 pl-3 text-sm"
              >
                <CheckIcon class="text-success mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>
                    Prompt reverted to default. Reset processing history so documents can be
                    reprocessed with the updated prompt?
                  </p>
                  <div class="mt-2 flex gap-2">
                    <!-- Native buttons: text-link actions; Button has no link variant. -->
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
            <!-- Native textarea: no multi-line primitive exists in the component set. -->
            <textarea
              aria-label="Prompt Template"
              bind:value={aiPromptTemplate}
              rows="12"
              class="border-border-hover bg-surface-raised text-ink w-full rounded-sm border px-3 py-2 font-mono text-xs leading-relaxed"
            ></textarea>
          </div>
        {/if}
      </div>

      <!-- Tag Alias Mapping -->
      <div class="border-soft mt-6 border-t pt-4">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2">
            <Checkbox bind:checked={aiTagAliasesEnabled} />
            <span class="text-ink text-sm font-medium">Enable Tag Alias Mapping</span>
          </label>
        </div>
        <p class="text-muted mt-1 text-xs">
          Maps variant tag names to canonical tags in the LLM prompt. When enabled, the alias map is
          included in the system prompt to normalise tag suggestions.
        </p>

        {#if aiTagAliasesEnabled}
          <div class="mt-3">
            <!-- Native button: text-link disclosure toggle; Button has no link variant. -->
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
                    class="border-warn text-ink flex items-start gap-3 border-l-2 py-1 pl-3 text-sm"
                  >
                    <WarningIcon class="text-warn mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p>
                        Your tag alias map has been customised and differs from the latest
                        recommended default.
                      </p>
                      <!-- Native button: text-link action; Button has no link variant. -->
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
                    class="border-success text-ink flex items-start gap-3 border-l-2 py-1 pl-3 text-sm"
                  >
                    <CheckIcon class="text-success mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p>
                        Tag alias map reverted to default. Reset processing history so documents can
                        be reprocessed with the updated aliases?
                      </p>
                      <div class="mt-2 flex gap-2">
                        <!-- Native buttons: text-link actions; Button has no link variant. -->
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
                <!-- Native textarea: no multi-line primitive exists in the component set. -->
                <textarea
                  aria-label="Tag Alias Map"
                  aria-invalid={tagAliasValidationError ? 'true' : undefined}
                  aria-describedby={tagAliasValidationError ? 'tag-alias-error' : undefined}
                  bind:value={aiTagAliasMap}
                  rows="16"
                  class="bg-surface-raised text-ink w-full rounded-sm border px-3 py-2 font-mono text-xs leading-relaxed {tagAliasValidationError
                    ? 'border-ember'
                    : 'border-border-hover'}"></textarea>
                {#if tagAliasValidationError}
                  <p id="tag-alias-error" class="text-ember text-xs">{tagAliasValidationError}</p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Reset Processing History -->
      <div class="border-soft mt-4 border-t pt-4">
        {#if resetConfirmCount !== null}
          <div class="border-ember text-ink flex items-start gap-3 border-l-2 py-1 pl-3 text-sm">
            <WarningIcon class="text-ember mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>
                This will delete {resetConfirmCount} AI processing result{resetConfirmCount === 1
                  ? ''
                  : 's'}. Documents will become eligible for reprocessing. This cannot be undone.
              </p>
              <div class="mt-2 flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onclick={resetProcessingHistory}
                  disabled={isResetting}
                >
                  {isResetting ? 'Resetting...' : 'Confirm Reset'}
                </Button>
                <!-- Native button: text-link action; Button has no link variant. -->
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
          <!-- Native button: text-link in the destructive colour; Button has no link variant. -->
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
        <!-- Native button: text-link disclosure toggle; Button has no link variant. -->
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
              <TextField
                id="ai-max-content"
                type="number"
                min={500}
                max={100000}
                class="mt-1"
                bind:value={aiMaxContentLength}
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
              <TextField
                id="ai-batch"
                type="number"
                min={1}
                max={100}
                class="mt-1"
                bind:value={aiBatchSize}
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
              <TextField
                id="ai-delay"
                type="number"
                min={0}
                max={60000}
                class="mt-1"
                bind:value={aiRateDelayMs}
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
              <TextField
                id="ai-retries"
                type="number"
                min={0}
                max={10}
                class="mt-1"
                bind:value={aiMaxRetries}
              />
            </div>
          </div>
        {/if}
      </div>

      <!-- Confidence Thresholds -->
      <div class="border-soft mt-4 border-t pt-4">
        <h3 class="text-ink text-sm font-semibold">Confidence Thresholds</h3>
        <p class="text-muted mt-1 text-xs">
          Set minimum confidence scores to help prioritize manual review.
        </p>

        <div class="mt-3">
          <label for="ai-conf-global" class="text-muted flex items-center gap-1.5 text-sm">
            Global Minimum
            <InfoIcon
              text="Use confidence to prioritize review. Set to 0 to disable the global threshold."
              position="top"
            />
          </label>
          <div class="mt-1 flex items-center gap-3">
            <!-- Native range slider: no slider primitive exists in the component set. -->
            <input
              id="ai-conf-global"
              type="range"
              min="0"
              max="100"
              bind:value={aiConfidenceGlobal}
              class="bg-soft accent-accent h-2 flex-1 cursor-pointer appearance-none"
            />
            <span class="text-ink w-12 text-right font-mono text-sm tabular-nums">
              {aiConfidenceGlobal}%
            </span>
          </div>
        </div>

        <!-- Native button: text-link disclosure toggle; Button has no link variant. -->
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
                <!-- Native range slider: no slider primitive exists in the component set. -->
                <input
                  id="ai-conf-title"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceTitle}
                  class="bg-soft accent-accent h-2 flex-1 cursor-pointer appearance-none"
                />
                <span class="text-ink w-12 text-right font-mono text-sm tabular-nums">
                  {aiConfidenceTitle}%
                </span>
              </div>
            </div>
            <div>
              <label for="ai-conf-corr" class="text-muted text-sm">Correspondent</label>
              <div class="mt-1 flex items-center gap-2">
                <!-- Native range slider: no slider primitive exists in the component set. -->
                <input
                  id="ai-conf-corr"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceCorrespondent}
                  class="bg-soft accent-accent h-2 flex-1 cursor-pointer appearance-none"
                />
                <span class="text-ink w-12 text-right font-mono text-sm tabular-nums">
                  {aiConfidenceCorrespondent}%
                </span>
              </div>
            </div>
            <div>
              <label for="ai-conf-type" class="text-muted text-sm">Document Type</label>
              <div class="mt-1 flex items-center gap-2">
                <!-- Native range slider: no slider primitive exists in the component set. -->
                <input
                  id="ai-conf-type"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceDocType}
                  class="bg-soft accent-accent h-2 flex-1 cursor-pointer appearance-none"
                />
                <span class="text-ink w-12 text-right font-mono text-sm tabular-nums">
                  {aiConfidenceDocType}%
                </span>
              </div>
            </div>
            <div>
              <label for="ai-conf-tags" class="text-muted text-sm">Tags</label>
              <div class="mt-1 flex items-center gap-2">
                <!-- Native range slider: no slider primitive exists in the component set. -->
                <input
                  id="ai-conf-tags"
                  type="range"
                  min="0"
                  max="100"
                  bind:value={aiConfidenceTags}
                  class="bg-soft accent-accent h-2 flex-1 cursor-pointer appearance-none"
                />
                <span class="text-ink w-12 text-right font-mono text-sm tabular-nums">
                  {aiConfidenceTags}%
                </span>
              </div>
            </div>
          </div>
          <p class="text-muted mt-2 text-xs">
            Per-field thresholds override the global minimum upward. The effective threshold for
            each field is the higher of the two.
          </p>
        {/if}
      </div>

      <!-- Save Button -->
      <div class="mt-6 flex items-center gap-3">
        <Button onclick={saveAiConfig} disabled={isSavingAi}>
          {isSavingAi ? 'Saving...' : 'Save AI Configuration'}
        </Button>
      </div>
      {#if aiSaveStatus}
        <div class="mt-3 border-l-2 py-1 pl-3 text-sm {statusClasses[aiSaveStatus.type]}">
          {aiSaveStatus.message}
        </div>
      {/if}
    </div>
  {/if}

  <div class:hidden={activeSettingsSection !== 'system'}>
    <!-- System Information -->
    <div class="panel" id="system">
      <h2 class="text-ink text-lg font-semibold">System Information</h2>
      <dl class="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt class="text-muted text-sm">Total Documents</dt>
          <dd class="text-ink mt-0.5 font-mono text-sm tabular-nums">
            {system.totalDocuments.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt class="text-muted text-sm">Pending Groups</dt>
          <dd class="text-ink mt-0.5 font-mono text-sm tabular-nums">
            {system.duplicateGroups.toLocaleString()}
          </dd>
        </div>
      </dl>
    </div>

    <DatabaseBackupSettings />

    <section class="panel" aria-label="Maintenance report">
      <h2 class="text-ink text-lg font-semibold">Maintenance report</h2>
      <p class="text-muted mt-1 text-sm">
        Read-only local state. Maintenance actions remain lease-controlled and no retention cleanup
        runs automatically.
      </p>
      <dl class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="panel-inset">
          <dt class="text-muted text-xs">Active leases</dt>
          <dd class="text-ink mt-1 font-mono text-sm tabular-nums">
            {data.maintenance.activeLeases.length}
          </dd>
        </div>
        <div class="panel-inset">
          <dt class="text-muted text-xs">Terminal jobs</dt>
          <dd class="text-ink mt-1 font-mono text-sm tabular-nums">
            {data.maintenance.terminalJobs.total} ({data.maintenance.terminalJobs
              .olderThanThirtyDays} older than 30 days)
          </dd>
        </div>
        <div class="panel-inset">
          <dt class="text-muted text-xs">Allocated database storage</dt>
          <dd class="text-ink mt-1 font-mono text-sm tabular-nums">
            {(data.maintenance.storage.allocatedBytes / 1024 / 1024).toFixed(1)} MiB
          </dd>
        </div>
      </dl>
    </section>

    <DiagnosticsSettings />

    <!-- Backup & Restore -->
    <div class="panel" id="backup">
      <h2 class="text-ink text-lg font-semibold">Backup & Restore</h2>
      <div class="mt-4 space-y-4">
        <div>
          <h3 class="text-ink text-sm font-medium">Export Configuration</h3>
          <p class="text-muted mt-1 text-xs">
            Download a backup of all settings and dedup parameters.
          </p>
          <Button
            href="/api/v1/export/config.json"
            download
            variant="outline"
            class="mt-2"
            onclick={() => trackConfigExported()}
          >
            Download Backup
          </Button>
        </div>
        <div class="border-soft border-t pt-4">
          <h3 class="text-ink text-sm font-medium">Import Configuration</h3>
          <p class="text-muted mt-1 text-xs">
            Restore settings from a previously exported backup file.
          </p>
          <div class="mt-2 flex items-center gap-3">
            <!-- Native file input: no file-upload primitive exists in the component set. -->
            <input
              aria-label="Configuration backup file"
              type="file"
              accept=".json"
              onchange={(e) => {
                const target = e.target as HTMLInputElement;
                importFile = target.files?.[0] ?? null;
                importStatus = null;
              }}
              class="text-ink file:border-border-hover file:text-ink file:hover:bg-canvas-deep text-sm file:mr-3 file:rounded-sm file:border file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium"
            />
            <Button onclick={handleImport} disabled={!importFile || isImporting}>
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </div>
      <DecisionBackup />
      {#if importStatus}
        <div class="mt-3 border-l-2 py-1 pl-3 text-sm {statusClasses[importStatus.type]}">
          {importStatus.message}
        </div>
      {/if}
    </div>
  </div>
</div>
