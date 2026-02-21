<script lang="ts">
  interface Props {
    cursor?: string;
    loading?: boolean;
    onLoadMore: (cursor: string) => void;
  }

  let { cursor, loading = false, onLoadMore }: Props = $props();
</script>

{#if cursor}
  <div class="flex justify-center pt-6">
    <button
      type="button"
      disabled={loading}
      onclick={() => onLoadMore(cursor!)}
      class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {loading ? 'Loading…' : 'Load more'}
    </button>
  </div>
{/if}
