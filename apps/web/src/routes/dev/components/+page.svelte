<script lang="ts">
  import { dev } from '$app/environment';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import TextArea from '$lib/components/ui/TextArea.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import Toast from '$lib/components/ui/Toast.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
  import PillTag from '$lib/components/ui/PillTag.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import PageHeader from '$lib/components/ui/PageHeader.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Inbox from 'lucide-svelte/icons/inbox';

  let modalOpen = $state(false);
  let confirmOpen = $state(false);
  let activeTab = $state('all');
</script>

{#if !dev}
  <p>This page is only available in development mode.</p>
{:else}
  <div class="max-w-4xl mx-auto space-y-10 pb-20">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[var(--cs-text)]">Design System</h1>
        <p class="text-[13px] text-[var(--cs-text-secondary)] mt-1">Component library preview</p>
      </div>
      <ThemeToggle variant="full" />
    </div>

    <!-- Buttons -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Buttons</h2>
      <Card>
        <div class="space-y-3">
          <div class="flex items-center gap-2 flex-wrap">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Card>
    </section>

    <!-- Badges -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Badges</h2>
      <Card>
        <div class="flex items-center gap-2 flex-wrap">
          <Badge>Default</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="success" dot>Active</Badge>
          <Badge variant="warning" dot>Pending</Badge>
          <Badge variant="danger" dot>Failed</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Card>
    </section>

    <!-- Pill Tags -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Pill Tags</h2>
      <Card>
        <div class="flex items-center gap-2 flex-wrap">
          <PillTag category="interest">Web Development</PillTag>
          <PillTag category="contribution">Code Review</PillTag>
          <PillTag category="constraint">Part-time only</PillTag>
          <PillTag category="redline">No surveillance</PillTag>
          <PillTag category="default" removable>Removable</PillTag>
        </div>
      </Card>
    </section>

    <!-- Avatars -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Avatars</h2>
      <Card>
        <div class="flex items-center gap-3">
          <Avatar name="Alice Smith" size="sm" />
          <Avatar name="Bob Jones" size="md" />
          <Avatar name="Charlie" size="lg" />
          <Avatar size="md" />
        </div>
      </Card>
    </section>

    <!-- Inputs -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Inputs</h2>
      <Card>
        <div class="space-y-4 max-w-md">
          <Input label="Email" type="email" placeholder="you@example.com" hint="We'll never share your email." />
          <Input label="Name" placeholder="Jane Doe" error="Name is required" />
          <TextArea label="Description" placeholder="Tell us about your cooperative..." />
          <Select
            label="Role"
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'member', label: 'Member' },
              { value: 'observer', label: 'Observer' },
            ]}
          />
        </div>
      </Card>
    </section>

    <!-- Tabs -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Tabs</h2>
      <Card>
        <Tabs
          tabs={[
            { id: 'all', label: 'All', count: 12 },
            { id: 'open', label: 'Open', count: 3 },
            { id: 'closed', label: 'Closed', count: 9 },
          ]}
          bind:active={activeTab}
        />
        <p class="mt-3 text-[13px] text-[var(--cs-text-secondary)]">Selected: {activeTab}</p>
      </Card>
    </section>

    <!-- Progress Bars -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Progress Bars</h2>
      <Card>
        <div class="space-y-3 max-w-md">
          <ProgressBar value={72} showLabel />
          <ProgressBar value={45} variant="success" showLabel />
          <ProgressBar value={90} variant="warning" size="md" showLabel />
          <ProgressBar value={20} variant="danger" showLabel />
        </div>
      </Card>
    </section>

    <!-- Spinners -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Spinners</h2>
      <Card>
        <div class="flex items-center gap-4">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
      </Card>
    </section>

    <!-- Toasts -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Toasts</h2>
      <div class="space-y-2">
        <Toast variant="success" message="Changes saved" description="Your cooperative settings have been updated." />
        <Toast variant="warning" message="Proposal closing soon" description="Voting ends in 2 hours." />
        <Toast variant="error" message="Failed to send invitation" description="Please check the email address and try again." />
        <Toast variant="info" message="New member joined" description="Alice has accepted your invitation." />
      </div>
    </section>

    <!-- Page Header -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Page Header</h2>
      <Card>
        <PageHeader
          title="Proposals"
          description="Create and vote on governance proposals for your cooperative."
        >
          {#snippet actions()}
            <Button variant="primary">New Proposal</Button>
          {/snippet}
        </PageHeader>
      </Card>
    </section>

    <!-- Empty State -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Empty State</h2>
      <Card>
        <EmptyState
          icon={Inbox}
          title="No proposals yet"
          description="Create your first governance proposal to get started."
        >
          {#snippet actions()}
            <Button variant="primary">Create Proposal</Button>
          {/snippet}
        </EmptyState>
      </Card>
    </section>

    <!-- Data Table -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Data Table</h2>
      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role' },
          { key: 'status', label: 'Status' },
          { key: 'joined', label: 'Joined', align: 'right' },
        ]}
        rows={[
          { name: 'Alice Smith', role: 'Admin', status: 'Active', joined: 'Jan 15' },
          { name: 'Bob Jones', role: 'Member', status: 'Active', joined: 'Feb 1' },
          { name: 'Charlie Brown', role: 'Observer', status: 'Pending', joined: 'Feb 10' },
        ]}
      />
    </section>

    <!-- Modals -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Modals</h2>
      <Card>
        <div class="flex gap-2">
          <Button variant="secondary" onclick={() => (modalOpen = true)}>Open Modal</Button>
          <Button variant="secondary" onclick={() => (confirmOpen = true)}>Confirm Dialog</Button>
        </div>
      </Card>

      <Modal bind:open={modalOpen} title="Create Invitation">
        <div class="space-y-4">
          <Input label="Email" type="email" placeholder="member@example.com" />
          <TextArea label="Message" placeholder="Welcome to the cooperative!" rows={3} />
        </div>
        {#snippet footer()}
          <Button variant="ghost" onclick={() => (modalOpen = false)}>Cancel</Button>
          <Button variant="primary" onclick={() => (modalOpen = false)}>Send Invitation</Button>
        {/snippet}
      </Modal>

      <ConfirmDialog
        bind:open={confirmOpen}
        title="Remove Member"
        message="Are you sure you want to remove this member? This action cannot be undone."
        confirmLabel="Remove"
        onconfirm={() => (confirmOpen = false)}
      />
    </section>

    <!-- Cards -->
    <section>
      <h2 class="text-[15px] font-semibold text-[var(--cs-text)] mb-3">Cards</h2>
      <div class="grid grid-cols-3 gap-3">
        <Card hover>
          <p class="text-[11px] font-medium text-[var(--cs-text-muted)] uppercase tracking-wider">Members</p>
          <p class="text-2xl font-semibold text-[var(--cs-text)] mt-1">24</p>
        </Card>
        <Card hover>
          <p class="text-[11px] font-medium text-[var(--cs-text-muted)] uppercase tracking-wider">Proposals</p>
          <p class="text-2xl font-semibold text-[var(--cs-text)] mt-1">7</p>
        </Card>
        <Card hover>
          <p class="text-[11px] font-medium text-[var(--cs-text-muted)] uppercase tracking-wider">Agreements</p>
          <p class="text-2xl font-semibold text-[var(--cs-text)] mt-1">3</p>
        </Card>
      </div>
    </section>
  </div>
{/if}
