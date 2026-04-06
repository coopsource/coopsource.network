<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal, ConfirmDialog } from '$lib/components/ui';
  import BookOpen from '@lucide/svelte/icons/book-open';

  let { data, form } = $props();
  let registerModalOpen = $state(false);
  let submitting = $state(false);
  let confirmDeleteNsid = $state<string | null>(null);

  const builtInLexicons = $derived(data.lexicons.filter((l) => l.source === 'built-in'));
  const registeredLexicons = $derived(data.lexicons.filter((l) => l.source === 'registered'));

  $effect(() => {
    if (form?.success) {
      registerModalOpen = false;
      submitting = false;
    }
    if (form?.deleteSuccess) {
      confirmDeleteNsid = null;
    }
  });
</script>

<svelte:head>
  <title>Lexicons -- Co-op Source</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <BookOpen class="h-5 w-5 text-[var(--cs-text-secondary)]" />
      <h1 class="text-xl font-semibold text-[var(--cs-text)]">Lexicons</h1>
    </div>
    <button type="button" onclick={() => (registerModalOpen = true)}
      class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]">
      Register lexicon
    </button>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- All Lexicons Table -->
  {#if data.lexicons.length === 0}
    <EmptyState title="No lexicons" description="Register your first lexicon to get started." />
  {:else}
    <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--cs-border)] text-left">
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">NSID</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Source</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Field Mappings</th>
            <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Registered</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--cs-border)]">
          {#each builtInLexicons as lex}
            <tr>
              <td class="px-4 py-3 font-mono text-xs font-medium text-[var(--cs-text)]">{lex.nsid}</td>
              <td class="px-4 py-3">
                <Badge variant="default">built-in</Badge>
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                {lex.fieldMappings ? 'Yes' : 'No'}
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)] text-xs">--</td>
              <td class="px-4 py-3"></td>
            </tr>
          {/each}
          {#each registeredLexicons as lex}
            <tr>
              <td class="px-4 py-3 font-mono text-xs font-medium text-[var(--cs-text)]">{lex.nsid}</td>
              <td class="px-4 py-3">
                <Badge variant="primary">registered</Badge>
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                {lex.fieldMappings ? 'Yes' : 'No'}
              </td>
              <td class="px-4 py-3 text-[var(--cs-text-muted)] text-xs">
                {lex.registeredAt ? new Date(lex.registeredAt).toLocaleDateString() : '--'}
              </td>
              <td class="px-4 py-3 text-right">
                <button type="button" onclick={() => (confirmDeleteNsid = lex.nsid)}
                  class="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Register Lexicon Modal -->
<Modal open={registerModalOpen} title="Register Lexicon" onclose={() => (registerModalOpen = false)}>
  <form method="POST" action="?/register"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}
    class="space-y-4">
    <div>
      <label for="lex-nsid" class="block text-sm font-medium text-[var(--cs-text-secondary)]">NSID</label>
      <input id="lex-nsid" name="nsid" type="text" required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder="e.g. com.example.record" />
    </div>
    <div>
      <label for="lex-doc" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Lexicon Document (JSON)</label>
      <textarea id="lex-doc" name="lexiconDoc" rows={10} required
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 font-mono text-xs text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder='&#123;"lexicon": 1, "id": "com.example.record", ...&#125;'></textarea>
    </div>
    <div>
      <label for="lex-mappings" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
        Field Mappings (JSON) <span class="text-[var(--cs-text-muted)]">(optional)</span>
      </label>
      <textarea id="lex-mappings" name="fieldMappings" rows={5}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 font-mono text-xs text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        placeholder='&#123;"field": "column", ...&#125;'></textarea>
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={() => (registerModalOpen = false)}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]">Cancel</button>
      <button type="submit" disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50">
        {submitting ? 'Registering...' : 'Register'}
      </button>
    </div>
  </form>
</Modal>

<!-- Confirm Delete -->
<ConfirmDialog
  open={confirmDeleteNsid !== null}
  title="Remove Lexicon"
  message="Are you sure you want to remove this registered lexicon? This cannot be undone."
  confirmLabel="Remove"
  variant="danger"
  onconfirm={() => {
    const form = document.getElementById('delete-lexicon-form') as HTMLFormElement | null;
    form?.requestSubmit();
  }}
  oncancel={() => (confirmDeleteNsid = null)}
/>

<form id="delete-lexicon-form" method="POST" action="?/remove" use:enhance class="hidden">
  <input type="hidden" name="nsid" value={confirmDeleteNsid ?? ''} />
</form>
