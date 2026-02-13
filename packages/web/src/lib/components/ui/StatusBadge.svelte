<script lang="ts">
  interface Props {
    status: string;
  }

  let { status }: Props = $props();

  /* Static class map for Tailwind detection */
  const statusClasses: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    running: 'bg-accent-light text-accent',
    completed: 'bg-success-light text-success',
    failed: 'bg-ember-light text-ember',
    cancelled: 'bg-gray-100 text-gray-600',
    reviewed: 'bg-accent-light text-accent',
    resolved: 'bg-success-light text-success',
  };

  let classes = $derived(statusClasses[status] ?? 'bg-gray-100 text-gray-600');
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {classes}">
  {status}
</span>
