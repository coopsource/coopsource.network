<script lang="ts">
  interface Props {
    title: string;
    description?: string;
  }

  let { title, description }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-16 text-center">
  <div class="mb-4 text-5xl text-gray-300">○</div>
  <h3 class="text-base font-semibold text-gray-900">{title}</h3>
  {#if description}
    <p class="mt-1 text-sm text-gray-500">{description}</p>
  {/if}
</div>
