<script lang="ts">
  import { goto } from '$app/navigation';

  let { data } = $props();

  $effect(() => {
    if (data.user) {
      goto('/dashboard');
    } else {
      goto('/login');
    }
  });
</script>
