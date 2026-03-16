<script lang="ts">
  import type { Member } from '$lib/api/types.js';

  interface Props {
    members: Member[];
    value: string;
    name?: string;
    id?: string;
    label?: string;
    required?: boolean;
    placeholder?: string;
  }

  let {
    members,
    value = $bindable(''),
    name = 'memberDid',
    id,
    label,
    required = false,
    placeholder = 'Search members…',
  }: Props = $props();

  let search = $state('');
  let open = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();

  const filtered = $derived(
    search
      ? members.filter(
          (m) =>
            m.displayName.toLowerCase().includes(search.toLowerCase()) ||
            (m.handle?.toLowerCase().includes(search.toLowerCase()) ?? false),
        )
      : members,
  );

  const selectedMember = $derived(members.find((m) => m.did === value));

  function select(member: Member) {
    value = member.did;
    search = '';
    open = false;
  }

  function handleFocus() {
    open = true;
  }

  function handleBlur() {
    // Close after one frame so onmousedown on dropdown items fires first
    requestAnimationFrame(() => {
      open = false;
    });
  }

  function handleInput(e: Event) {
    search = (e.target as HTMLInputElement).value;
    open = true;
    // Clear selection when typing
    if (value && search) {
      value = '';
    }
  }

  function clear() {
    value = '';
    search = '';
    inputEl?.focus();
  }
</script>

<div class="relative">
  {#if label}
    <label for={id ?? name} class="block text-sm font-medium text-[var(--cs-text-secondary)]">{label}</label>
  {/if}
  <input type="hidden" {name} {value} />
  <div class="relative {label ? 'mt-1' : ''}">
    <input
      bind:this={inputEl}
      id={id ?? name}
      type="text"
      value={selectedMember ? `${selectedMember.displayName}${selectedMember.handle ? ` (@${selectedMember.handle})` : ''}` : search}
      oninput={handleInput}
      onfocus={handleFocus}
      onblur={handleBlur}
      {required}
      {placeholder}
      autocomplete="off"
      class="block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)] {value ? 'pr-8' : ''}"
    />
    {#if value}
      <button
        type="button"
        onclick={clear}
        class="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--cs-text-muted)] hover:text-[var(--cs-text)]"
      >
        &times;
      </button>
    {/if}
  </div>
  {#if open && filtered.length > 0}
    <div class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-elevated)] shadow-lg">
      {#each filtered as member}
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)] {member.did === value ? 'bg-[var(--cs-bg-inset)]' : ''}"
          onmousedown={() => select(member)}
        >
          <div>
            <div class="font-medium">{member.displayName}</div>
            {#if member.handle}
              <div class="text-xs text-[var(--cs-text-muted)]">@{member.handle}</div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
