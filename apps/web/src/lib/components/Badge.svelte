<script lang="ts">
  interface Props {
    status: string;
    class?: string;
  }

  let { status, class: extraClass = '' }: Props = $props();

  const colorMap: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    open: 'bg-blue-100 text-blue-700',
    closed: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700',
    signed: 'bg-green-100 text-green-700',
    void: 'bg-red-100 text-red-700',
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-700',
    pending: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-green-100 text-green-700',
    revoked: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-700',
  };

  const colorClass = $derived(colorMap[status] ?? 'bg-gray-100 text-gray-700');
</script>

<span
  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {colorClass} {extraClass}"
>
  {status}
</span>
