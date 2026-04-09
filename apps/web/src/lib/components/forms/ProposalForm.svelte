<script lang="ts">
  interface Props {
    initialValues?: Partial<{
      title: string;
      body: string;
      votingType: string;
      quorumType: string;
      closesAt: string;
    }>;
  }

  let { initialValues }: Props = $props();
</script>

<div>
  <label for="title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
  <input
    id="title"
    name="title"
    type="text"
    required
    value={initialValues?.title ?? ''}
    class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
    placeholder="Proposal title"
  />
</div>

<div>
  <label for="body" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
  <textarea
    id="body"
    name="body"
    required
    rows={8}
    class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
    placeholder="Describe the proposal in detail..."
  >{initialValues?.body ?? ''}</textarea>
</div>

<div class="grid grid-cols-2 gap-4">
  <div>
    <label for="votingType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
      Voting Method
    </label>
    <select
      id="votingType"
      name="votingType"
      value={initialValues?.votingType ?? 'binary'}
      class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
    >
      <option value="binary">Yes / No</option>
      <option value="approval">Approval</option>
      <option value="ranked">Ranked Choice</option>
    </select>
  </div>

  <div>
    <label for="quorumType" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Quorum</label>
    <select
      id="quorumType"
      name="quorumType"
      value={initialValues?.quorumType ?? 'simpleMajority'}
      class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
    >
      <option value="simpleMajority">Simple Majority</option>
      <option value="superMajority">Supermajority (2/3)</option>
      <option value="unanimous">Unanimous</option>
    </select>
  </div>
</div>

<div>
  <label for="closesAt" class="block text-sm font-medium text-[var(--cs-text-secondary)]">
    Voting Deadline <span class="text-[var(--cs-text-muted)]">(optional)</span>
  </label>
  <input
    id="closesAt"
    name="closesAt"
    type="datetime-local"
    value={initialValues?.closesAt ?? ''}
    class="mt-1 block w-full rounded-md border border-[var(--cs-border)] px-3 py-2 text-sm focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
  />
</div>
