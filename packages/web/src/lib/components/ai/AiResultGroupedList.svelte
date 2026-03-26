<script lang="ts">
  import { ChevronDown, ChevronUp, FolderOpen } from 'lucide-svelte';
  import { SvelteSet } from 'svelte/reactivity';

  interface GroupItem {
    key: string;
    count: number;
    resultIds: string[];
  }

  interface Props {
    groups: GroupItem[];
    groupBy: string;
    onselectgroup: (resultIds: string[]) => void;
  }

  let { groups, groupBy, onselectgroup }: Props = $props();

  const expandedKeys = new SvelteSet<string>();

  function toggleExpand(key: string) {
    if (expandedKeys.has(key)) {
      expandedKeys.delete(key);
    } else {
      expandedKeys.add(key);
    }
  }
</script>

{#if groups.length === 0}
  <div class="panel flex flex-col items-center py-16 text-center">
    <div class="bg-accent-subtle mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
      <FolderOpen class="text-accent h-7 w-7" />
    </div>
    <p class="text-ink text-base font-medium">No groups found</p>
    <p class="text-muted mx-auto mt-2 max-w-sm text-sm">
      There are no results to group by {groupBy}.
    </p>
  </div>
{:else}
  <div class="space-y-2">
    {#each groups as group (group.key)}
      <div class="border-soft overflow-hidden rounded-xl border">
        <!-- Group header -->
        <div
          onclick={() => toggleExpand(group.key)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') toggleExpand(group.key);
          }}
          class="bg-canvas/60 hover:bg-canvas flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors"
          role="button"
          tabindex="0"
        >
          <span class="text-muted shrink-0">
            {#if expandedKeys.has(group.key)}
              <ChevronUp class="h-4 w-4" />
            {:else}
              <ChevronDown class="h-4 w-4" />
            {/if}
          </span>
          <span class="text-ink min-w-0 flex-1 truncate text-sm font-medium">
            {group.key || '(none)'}
          </span>
          <span
            class="bg-accent-subtle text-accent shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          >
            {group.count}
          </span>
          <button
            onclick={(e) => {
              e.stopPropagation();
              onselectgroup(group.resultIds);
            }}
            class="text-accent hover:bg-accent-subtle shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors"
          >
            Select All in Group
          </button>
        </div>

        <!-- Expanded content -->
        {#if expandedKeys.has(group.key)}
          <div class="border-soft border-t px-4 py-3">
            <p class="text-muted text-sm">
              {group.resultIds.length} result{group.resultIds.length === 1 ? '' : 's'} in this group
            </p>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
