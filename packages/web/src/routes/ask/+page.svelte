<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    trackRagQuestionAsked,
    trackRagConversationStarted,
    trackRagConversationDeleted,
    trackRagIndexingStarted,
    startTimer,
  } from '$lib/faro-events';
  import {
    MessageCircleQuestion,
    Send,
    Plus,
    Trash2,
    FileText,
    ChevronDown,
    ChevronRight,
    AlertTriangle,
    Zap,
    PanelLeftClose,
    PanelLeftOpen,
    Loader2,
  } from 'lucide-svelte';

  interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: { documentId: string; title: string; chunkContent: string; score: number }[];
  }

  interface Conversation {
    id: string;
    title: string | null;
    createdAt: string;
    messageCount: number;
  }

  let { data } = $props();

  const initialConversations = untrack(() => data.conversations);
  const initialStats = untrack(() => data.stats);

  let conversations = $state<Conversation[]>(initialConversations);
  let stats = $state(initialStats);
  let activeConversationId = $state<string | null>(null);
  let messages = $state<Message[]>([]);
  let inputText = $state('');
  let isStreaming = $state(false);
  let streamingText = $state('');
  let sidebarOpen = $state(true);
  let expandedSources = new SvelteSet<number>();
  let isIndexing = $state(initialStats.isIndexingInProgress);
  let indexPolling: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (initialStats.isIndexingInProgress) {
      pollIndexStatus();
    }
  });
  let chatContainer: HTMLDivElement | undefined = $state();

  let needsIndexing = $derived(stats.unindexedDocuments > 0);
  let totalDocuments = $derived(stats.indexedDocuments + stats.unindexedDocuments);
  let canAsk = $derived(stats.totalChunks > 0 && !isStreaming && inputText.trim().length > 0);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    });
  }

  function renderMarkdown(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(
        /```(\w*)\n([\s\S]*?)```/g,
        '<pre class="bg-canvas border-soft my-2 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed"><code>$2</code></pre>',
      )
      .replace(
        /`([^`]+)`/g,
        '<code class="bg-canvas border-soft rounded px-1.5 py-0.5 font-mono text-xs border">$1</code>',
      )
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3 class="text-ink mt-3 mb-1 text-sm font-semibold">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-ink mt-3 mb-1 font-semibold">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-ink mt-3 mb-1 text-lg font-bold">$1</h1>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
      .replace(/\n{2,}/g, '</p><p class="mt-2">')
      .replace(/\n/g, '<br>');
  }

  async function loadConversation(id: string) {
    activeConversationId = id;
    try {
      const res = await fetch(`/api/v1/rag/conversations/${id}`);
      const json = await res.json();
      if (res.ok && json.data) {
        messages = json.data.messages.map(
          (m: { role: string; content: string; sourcesJson?: string }) => ({
            role: m.role,
            content: m.content,
            sources: m.sourcesJson ? JSON.parse(m.sourcesJson) : undefined,
          }),
        );
        scrollToBottom();
      }
    } catch {
      // Failed to load
    }
  }

  function startNewConversation() {
    activeConversationId = null;
    messages = [];
    inputText = '';
    expandedSources.clear();
    trackRagConversationStarted();
  }

  async function deleteConversation(id: string, event: MouseEvent) {
    event.stopPropagation();
    try {
      const res = await fetch(`/api/v1/rag/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        trackRagConversationDeleted();
        conversations = conversations.filter((c) => c.id !== id);
        if (activeConversationId === id) {
          startNewConversation();
        }
      }
    } catch {
      // Failed to delete
    }
  }

  async function sendMessage() {
    const question = inputText.trim();
    if (!question || isStreaming) return;

    trackRagQuestionAsked(question.length);
    const stopRagTimer = startTimer('rag_response_time');
    inputText = '';
    isStreaming = true;
    streamingText = '';

    // Add user message
    messages = [...messages, { role: 'user', content: question }];
    scrollToBottom();

    try {
      const res = await fetch('/api/v1/rag/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          conversationId: activeConversationId ?? undefined,
        }),
      });

      // Get conversation ID and sources from headers
      const newConvId = res.headers.get('X-Conversation-Id');
      const sourcesHeader = res.headers.get('X-Sources');
      let sources: Message['sources'];
      if (sourcesHeader) {
        try {
          sources = JSON.parse(sourcesHeader);
        } catch {
          // Invalid sources
        }
      }

      if (newConvId && !activeConversationId) {
        activeConversationId = newConvId;
        // Add to conversation list
        conversations = [
          {
            id: newConvId,
            title: question.slice(0, 80),
            createdAt: new Date().toISOString(),
            messageCount: 1,
          },
          ...conversations,
        ];
      }

      if (!res.ok || !res.body) {
        const errorJson = await res.json().catch(() => null);
        messages = [
          ...messages,
          {
            role: 'assistant',
            content: errorJson?.error?.message ?? 'Failed to get a response. Please try again.',
          },
        ];
        isStreaming = false;
        return;
      }

      // Stream the response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        streamingText = fullText;
        scrollToBottom();
      }

      // Finalize the message
      messages = [...messages, { role: 'assistant', content: fullText, sources }];
      streamingText = '';

      // Update conversation in sidebar
      if (activeConversationId) {
        conversations = conversations.map((c) =>
          c.id === activeConversationId ? { ...c, messageCount: c.messageCount + 2 } : c,
        );
      }
    } catch {
      messages = [
        ...messages,
        { role: 'assistant', content: 'A network error occurred. Please try again.' },
      ];
    }

    isStreaming = false;
    stopRagTimer();
    scrollToBottom();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function toggleSources(index: number) {
    if (expandedSources.has(index)) {
      expandedSources.delete(index);
    } else {
      expandedSources.add(index);
    }
  }

  async function startIndexing() {
    isIndexing = true;
    trackRagIndexingStarted();
    try {
      const res = await fetch('/api/v1/rag/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.jobId) {
          pollIndexStatus();
        }
      } else if (res.status === 409) {
        // Job already running — start polling to track progress
        pollIndexStatus();
      } else {
        isIndexing = false;
      }
    } catch {
      isIndexing = false;
    }
  }

  function pollIndexStatus() {
    if (indexPolling) return;
    indexPolling = setInterval(async () => {
      try {
        const res = await fetch('/api/v1/rag/stats');
        const json = await res.json();
        if (res.ok && json.data) {
          stats = json.data;
          if (json.data.unindexedDocuments === 0 || !json.data.isIndexingInProgress) {
            clearInterval(indexPolling!);
            indexPolling = null;
            isIndexing = false;
          }
        } else {
          clearInterval(indexPolling!);
          indexPolling = null;
          isIndexing = false;
        }
      } catch {
        clearInterval(indexPolling!);
        indexPolling = null;
        isIndexing = false;
      }
    }, 3000);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
</script>

<svelte:head>
  <title>Ask Documents - Paperless NGX Dedupe</title>
</svelte:head>

<div class="flex h-[calc(100vh-2rem)] flex-col sm:h-[calc(100vh-3rem)] md:h-[calc(100vh-4rem)]">
  <!-- Index Status Banner -->
  {#if needsIndexing}
    <div
      class="border-soft bg-surface mb-3 flex items-center gap-3 rounded-lg border px-4 py-2.5"
      style="background: oklch(0.95 0.02 85);"
    >
      <AlertTriangle class="h-4 w-4 shrink-0" style="color: oklch(0.65 0.15 75);" />
      <span class="text-ink text-sm">
        <strong>{stats.indexedDocuments}</strong> of <strong>{totalDocuments}</strong> documents
        indexed.
        {stats.unindexedDocuments} document{stats.unindexedDocuments === 1 ? '' : 's'} need{stats.unindexedDocuments ===
        1
          ? 's'
          : ''} indexing for Q&A.{#if stats.indexCost}
          <span class="text-muted">
            Estimated cost: ~${stats.indexCost.estimatedCostUsd < 0.01
              ? '<0.01'
              : stats.indexCost.estimatedCostUsd.toFixed(2)}
          </span>
        {/if}
      </span>
      <button
        onclick={startIndexing}
        disabled={isIndexing}
        class="bg-accent hover:bg-accent-hover ml-auto shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {#if isIndexing}
          <span class="flex items-center gap-1.5">
            <Loader2 class="h-3 w-3 animate-spin" />
            Indexing...
          </span>
        {:else}
          <span class="flex items-center gap-1.5">
            <Zap class="h-3 w-3" />
            Index Now
          </span>
        {/if}
      </button>
    </div>
  {/if}

  <div class="border-soft bg-surface flex min-h-0 flex-1 overflow-hidden rounded-xl border">
    <!-- Sidebar -->
    <div
      class="border-soft flex h-full shrink-0 flex-col border-r transition-all duration-200 {sidebarOpen
        ? 'w-64'
        : 'w-0 overflow-hidden border-r-0'}"
    >
      <div class="flex items-center justify-between p-3">
        <h2 class="text-ink text-xs font-semibold tracking-wider uppercase">Conversations</h2>
        <button
          onclick={() => (sidebarOpen = false)}
          class="text-muted hover:text-ink rounded p-1"
          title="Close sidebar"
        >
          <PanelLeftClose class="h-4 w-4" />
        </button>
      </div>

      <div class="px-3 pb-2">
        <button
          onclick={startNewConversation}
          class="bg-accent hover:bg-accent-hover flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
        >
          <Plus class="h-4 w-4" />
          New Conversation
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-2">
        {#each conversations as conv (conv.id)}
          <div
            onclick={() => loadConversation(conv.id)}
            onkeydown={(e) => e.key === 'Enter' && loadConversation(conv.id)}
            role="button"
            tabindex="0"
            class="group mb-0.5 flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors {activeConversationId ===
            conv.id
              ? 'bg-accent/10 text-accent'
              : 'text-ink hover:bg-canvas'}"
          >
            <MessageCircleQuestion
              class="mt-0.5 h-3.5 w-3.5 shrink-0 {activeConversationId === conv.id
                ? 'text-accent'
                : 'text-muted'}"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm leading-snug font-medium">
                {conv.title ?? 'Untitled'}
              </p>
              <p class="text-muted mt-0.5 text-xs">
                {formatDate(conv.createdAt)} · {conv.messageCount} msg{conv.messageCount === 1
                  ? ''
                  : 's'}
              </p>
            </div>
            <button
              onclick={(e) => deleteConversation(conv.id, e)}
              class="text-muted hover:text-ember mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              title="Delete conversation"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        {/each}
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Chat header -->
      <div class="border-soft flex items-center gap-2 border-b px-4 py-2.5">
        {#if !sidebarOpen}
          <button
            onclick={() => (sidebarOpen = true)}
            class="text-muted hover:text-ink rounded p-1"
            title="Open sidebar"
          >
            <PanelLeftOpen class="h-4 w-4" />
          </button>
        {/if}
        <MessageCircleQuestion class="text-accent h-4 w-4" />
        <h1 class="text-ink text-sm font-semibold">Ask Documents</h1>
        {#if stats.totalChunks > 0}
          <span class="text-muted ml-auto text-xs">
            {stats.indexedDocuments} docs · {stats.totalChunks.toLocaleString()} chunks indexed
          </span>
        {/if}
      </div>

      <!-- Messages -->
      <div bind:this={chatContainer} class="flex-1 overflow-y-auto px-4 py-4">
        {#if messages.length === 0 && !isStreaming}
          <!-- Empty State -->
          <div class="flex h-full flex-col items-center justify-center text-center">
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style="background: oklch(0.92 0.04 195);"
            >
              <MessageCircleQuestion class="text-accent h-8 w-8" />
            </div>
            <h2 class="text-ink text-lg font-semibold">Ask your documents anything</h2>
            <p class="text-muted mt-2 max-w-sm text-sm leading-relaxed">
              Ask natural language questions and get answers sourced directly from your
              Paperless-NGX documents.
            </p>
            {#if stats.totalChunks === 0}
              <div
                class="border-soft mt-6 rounded-lg border px-4 py-3"
                style="background: oklch(0.95 0.02 85);"
              >
                <p class="text-ink text-sm font-medium">Index your documents first</p>
                <p class="text-muted mt-1 text-xs">
                  Documents need to be indexed before you can ask questions.
                </p>
                <button
                  onclick={startIndexing}
                  disabled={isIndexing}
                  class="bg-accent hover:bg-accent-hover mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isIndexing ? 'Indexing...' : 'Start Indexing'}
                </button>
              </div>
            {:else}
              <div class="text-muted mt-6 space-y-2 text-sm">
                <p>Try asking:</p>
                <div class="flex flex-wrap justify-center gap-2">
                  {#each ['What invoices did I receive last month?', 'Summarize my insurance policies', 'Find contracts mentioning penalties'] as suggestion (suggestion)}
                    <button
                      onclick={() => {
                        inputText = suggestion;
                      }}
                      class="border-soft hover:border-accent hover:text-accent rounded-lg border px-3 py-1.5 text-xs transition-colors"
                    >
                      {suggestion}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <!-- Message List -->
          <div class="mx-auto max-w-2xl space-y-4">
            {#each messages as msg, i (i)}
              {#if msg.role === 'user'}
                <!-- User message -->
                <div class="flex justify-end">
                  <div
                    class="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-white"
                    style="background: oklch(0.55 0.12 195);"
                  >
                    {msg.content}
                  </div>
                </div>
              {:else}
                <!-- Assistant message -->
                <div class="flex justify-start">
                  <div class="max-w-[90%]">
                    <div
                      class="bg-canvas border-soft prose-sm rounded-2xl rounded-bl-md border px-4 py-3 text-sm leading-relaxed"
                    >
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized markdown -->
                      {@html renderMarkdown(msg.content)}
                    </div>

                    <!-- Source Citations -->
                    {#if msg.sources && msg.sources.length > 0}
                      <div class="mt-1.5">
                        <button
                          onclick={() => toggleSources(i)}
                          class="text-muted hover:text-accent flex items-center gap-1 text-xs font-medium transition-colors"
                        >
                          {#if expandedSources.has(i)}
                            <ChevronDown class="h-3 w-3" />
                          {:else}
                            <ChevronRight class="h-3 w-3" />
                          {/if}
                          {msg.sources.length} source{msg.sources.length === 1 ? '' : 's'}
                        </button>

                        {#if expandedSources.has(i)}
                          <div class="mt-1.5 space-y-1.5">
                            {#each msg.sources as source (source.documentId + source.chunkContent.slice(0, 20))}
                              <div class="border-soft bg-canvas rounded-lg border px-3 py-2">
                                <div class="flex items-start gap-2">
                                  <FileText class="text-accent mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <div class="min-w-0 flex-1">
                                    <p class="text-ink text-xs leading-snug font-medium">
                                      {source.title}
                                    </p>
                                    <p class="text-muted mt-1 line-clamp-2 text-xs leading-relaxed">
                                      {source.chunkContent.slice(0, 200)}...
                                    </p>
                                    <div class="mt-1 flex items-center gap-2">
                                      <span
                                        class="rounded px-1.5 py-0.5 text-xs font-medium"
                                        style="background: oklch(0.92 0.04 195); color: oklch(0.45 0.12 195);"
                                      >
                                        {(source.score * 100).toFixed(0)}% match
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}

            <!-- Streaming indicator -->
            {#if isStreaming}
              <div class="flex justify-start">
                <div class="max-w-[90%]">
                  <div
                    class="bg-canvas border-soft rounded-2xl rounded-bl-md border px-4 py-3 text-sm leading-relaxed"
                  >
                    {#if streamingText}
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized markdown -->
                      {@html renderMarkdown(streamingText)}
                    {/if}
                    <span class="inline-flex items-center gap-0.5 align-baseline">
                      <span
                        class="bg-accent inline-block h-1.5 w-1.5 animate-bounce rounded-full"
                        style="animation-delay: 0ms;"
                      ></span>
                      <span
                        class="bg-accent inline-block h-1.5 w-1.5 animate-bounce rounded-full"
                        style="animation-delay: 150ms;"
                      ></span>
                      <span
                        class="bg-accent inline-block h-1.5 w-1.5 animate-bounce rounded-full"
                        style="animation-delay: 300ms;"
                      ></span>
                    </span>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Input Bar -->
      <div class="border-soft border-t px-4 py-3">
        <div class="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            bind:value={inputText}
            onkeydown={handleKeydown}
            placeholder={stats.totalChunks === 0
              ? 'Index your documents first...'
              : 'Ask a question about your documents...'}
            disabled={stats.totalChunks === 0 || isStreaming}
            rows="1"
            class="border-soft bg-canvas text-ink placeholder:text-muted focus:border-accent focus:ring-accent max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border px-4 py-2.5 text-sm focus:ring-1 focus:outline-none disabled:opacity-50"
          ></textarea>
          <button
            onclick={sendMessage}
            disabled={!canAsk}
            class="bg-accent hover:bg-accent-hover flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-white transition-colors disabled:opacity-40"
          >
            {#if isStreaming}
              <Loader2 class="h-4 w-4 animate-spin" />
            {:else}
              <Send class="h-4 w-4" />
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
