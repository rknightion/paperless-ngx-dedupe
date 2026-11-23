<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
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
  <div class="text-muted mx-auto max-w-sm py-16 text-center text-sm">
    <p class="text-ink font-medium">No groups found</p>
    <p class="mt-1">There are no results to group by {groupBy}.</p>
  </div>
{:else}
  <div class="space-y-2">
    {#each groups as group (group.key)}
      <div class="border-border overflow-hidden border">
        <!-- Group header -->
        <div
          onclick={() => toggleExpand(group.key)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') toggleExpand(group.key);
          }}
          class="bg-surface hover:bg-canvas-deep flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors"
          role="button"
          tabindex="0"
        >
          <span class="text-muted shrink-0">
            {#if expandedKeys.has(group.key)}
              <CaretUpIcon class="h-4 w-4" />
            {:else}
              <CaretDownIcon class="h-4 w-4" />
            {/if}
          </span>
          <span class="text-ink min-w-0 flex-1 truncate text-sm font-medium">
            {group.key || '(none)'}
          </span>
          <span class="text-muted shrink-0 font-mono text-xs tabular-nums">
            {group.count}
          </span>
          <button
            onclick={(e) => {
              e.stopPropagation();
              onselectgroup(group.resultIds);
            }}
            class="text-accent hover:bg-canvas-deep shrink-0 px-3 py-1 text-sm font-medium transition-colors"
          >
            Select All in Group
          </button>
        </div>

        <!-- Expanded content -->
        {#if expandedKeys.has(group.key)}
          <div class="border-border border-t px-4 py-3">
            <p class="text-muted text-sm">
              {group.resultIds.length} result{group.resultIds.length === 1 ? '' : 's'} in this group
            </p>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
