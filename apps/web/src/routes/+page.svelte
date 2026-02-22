<script lang="ts">
  import { goto } from '$app/navigation';

  // Server-side load always redirects; this is a client-side fallback
  $effect(() => {
    goto('/login');
  });
</script>
