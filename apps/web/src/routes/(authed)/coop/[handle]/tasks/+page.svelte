<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge, EmptyState, Modal } from '$lib/components/ui';
  import { workspacePrefix } from '$lib/utils/workspace.js';
  import { canEditTask } from '$lib/utils/entity-permissions.js';
  import type { Task, TaskLabel } from '$lib/api/types.js';

  let { data, form } = $props();

  let showCreateForm = $state(false);
  let editingTask = $state<Task | null>(null);
  let submitting = $state(false);
  let viewMode = $state<'board' | 'list'>('board');

  $effect(() => {
    if (form?.success) {
      showCreateForm = false;
      editingTask = null;
    }
  });

  const statusColumns = [
    { id: 'backlog', label: 'Backlog' },
    { id: 'todo', label: 'To Do' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'in_review', label: 'In Review' },
    { id: 'done', label: 'Done' },
  ];

  const priorityFilters = [
    { value: '', label: 'All Priorities' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  const statusFilters = [
    { value: '', label: 'All Statuses' },
    { value: 'backlog', label: 'Backlog' },
    { value: 'todo', label: 'To Do' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'in_review', label: 'In Review' },
    { value: 'done', label: 'Done' },
  ];

  function tasksByStatus(status: string): Task[] {
    return data.tasks.filter((t: Task) => t.status === status);
  }

  function priorityColor(priority: string): string {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700';
      case 'high': return 'bg-orange-100 text-orange-700';
      case 'medium': return 'bg-blue-100 text-blue-700';
      case 'low': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  function statusColor(status: string): 'success' | 'warning' | 'danger' | 'default' {
    switch (status) {
      case 'done': return 'success';
      case 'in_progress': case 'in_review': return 'warning';
      case 'backlog': return 'default';
      default: return 'default';
    }
  }

  function getLabelByName(name: string): TaskLabel | undefined {
    return data.labels.find((l: TaskLabel) => l.name === name);
  }
</script>

<svelte:head>
  <title>Tasks — Co-op Source</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-[var(--cs-text)]">Tasks</h1>
    <div class="flex items-center gap-2">
      <div class="flex rounded-md border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <button
          type="button"
          onclick={() => (viewMode = 'board')}
          class="px-3 py-1.5 text-xs font-medium transition-colors {viewMode === 'board' ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]' : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'} rounded-l-md"
        >Board</button>
        <button
          type="button"
          onclick={() => (viewMode = 'list')}
          class="px-3 py-1.5 text-xs font-medium transition-colors {viewMode === 'list' ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]' : 'text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'} rounded-r-md"
        >List</button>
      </div>
      <button
        type="button"
        onclick={() => (showCreateForm = true)}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)]"
      >New Task</button>
    </div>
  </div>

  {#if form?.error}
    <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
  {/if}

  <!-- Filters -->
  <div class="flex gap-2">
    {#each statusFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/tasks?status=${filter.value}${data.filterPriority ? `&priority=${data.filterPriority}` : ''}`
          : `${$workspacePrefix}/tasks${data.filterPriority ? `?priority=${data.filterPriority}` : ''}`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterStatus === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
    <span class="border-l border-[var(--cs-border)] mx-1"></span>
    {#each priorityFilters as filter}
      <a
        href={filter.value
          ? `${$workspacePrefix}/tasks?priority=${filter.value}${data.filterStatus ? `&status=${data.filterStatus}` : ''}`
          : `${$workspacePrefix}/tasks${data.filterStatus ? `?status=${data.filterStatus}` : ''}`}
        class="px-3 py-1.5 text-xs font-medium rounded-full transition-colors
          {data.filterPriority === filter.value
            ? 'bg-[var(--cs-primary)] text-[var(--cs-text-on-primary)]'
            : 'bg-[var(--cs-bg-inset)] text-[var(--cs-text-secondary)] hover:text-[var(--cs-text)]'}"
      >{filter.label}</a>
    {/each}
  </div>

  <!-- Board View -->
  {#if viewMode === 'board'}
    {#if data.tasks.length === 0}
      <EmptyState title="No tasks yet" description="Create your first task to get started." />
    {:else}
      <div class="grid grid-cols-5 gap-3 overflow-x-auto">
        {#each statusColumns as column}
          <div class="min-w-[200px]">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--cs-text-muted)]">{column.label}</h3>
              <span class="rounded-full bg-[var(--cs-bg-inset)] px-2 py-0.5 text-xs text-[var(--cs-text-muted)]">{tasksByStatus(column.id).length}</span>
            </div>
            <div class="space-y-2">
              {#each tasksByStatus(column.id) as task (task.id)}
                <div class="group relative rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)] p-3 hover:border-[var(--cs-border-hover)] hover:shadow-sm transition-shadow">
                  <div class="flex items-start justify-between gap-2">
                    <h4 class="text-sm font-medium text-[var(--cs-text)] leading-snug">{task.title}</h4>
                  </div>
                  {#if canEditTask(task)}
                    <button
                      type="button"
                      onclick={(e) => { e.stopPropagation(); editingTask = task; }}
                      class="absolute top-2 right-2 hidden group-hover:block rounded p-0.5 text-[var(--cs-text-muted)] hover:text-[var(--cs-text)] hover:bg-[var(--cs-bg-inset)]"
                      aria-label="Edit task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  {/if}
                  {#if task.description}
                    <p class="mt-1 text-xs text-[var(--cs-text-muted)] line-clamp-2">{task.description}</p>
                  {/if}
                  <div class="mt-2 flex flex-wrap items-center gap-1.5">
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {priorityColor(task.priority)}">{task.priority}</span>
                    {#each task.labels as label}
                      {@const labelObj = getLabelByName(label)}
                      <span
                        class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style="background-color: {labelObj?.color ?? '#e5e7eb'}20; color: {labelObj?.color ?? '#6b7280'}"
                      >{label}</span>
                    {/each}
                  </div>
                  <div class="mt-2 flex items-center justify-between text-[10px] text-[var(--cs-text-muted)]">
                    {#if task.dueDate}
                      <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                    {:else}
                      <span></span>
                    {/if}
                    {#if task.assigneeDids.length > 0}
                      <span class="rounded-full bg-[var(--cs-bg-inset)] px-1.5 py-0.5">{task.assigneeDids.length} assigned</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- List View -->
  {#if viewMode === 'list'}
    {#if data.tasks.length === 0}
      <EmptyState title="No tasks yet" description="Create your first task to get started." />
    {:else}
      <div class="rounded-lg border border-[var(--cs-border)] bg-[var(--cs-bg-card)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--cs-border)] text-left">
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Title</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Status</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Priority</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Due Date</th>
              <th class="px-4 py-3 font-medium text-[var(--cs-text-secondary)]">Labels</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--cs-border)]">
            {#each data.tasks as task (task.id)}
              <tr class="hover:bg-[var(--cs-bg-inset)] transition-colors">
                <td class="px-4 py-3">
                  <div>
                    <span class="font-medium text-[var(--cs-text)]">{task.title}</span>
                    {#if task.description}
                      <p class="mt-0.5 text-xs text-[var(--cs-text-muted)] line-clamp-1">{task.description}</p>
                    {/if}
                  </div>
                </td>
                <td class="px-4 py-3">
                  <Badge variant={statusColor(task.status)}>{task.status.replace('_', ' ')}</Badge>
                </td>
                <td class="px-4 py-3">
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium {priorityColor(task.priority)}">{task.priority}</span>
                </td>
                <td class="px-4 py-3 text-[var(--cs-text-muted)]">
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    {#each task.labels as label}
                      {@const labelObj = getLabelByName(label)}
                      <span
                        class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style="background-color: {labelObj?.color ?? '#e5e7eb'}20; color: {labelObj?.color ?? '#6b7280'}"
                      >{label}</span>
                    {/each}
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  {#if canEditTask(task)}
                    <button type="button" onclick={() => { editingTask = task; }} class="text-xs text-[var(--cs-primary)] hover:underline mr-2">Edit</button>
                  {/if}
                  <form method="POST" action="?/updateStatus" use:enhance class="inline">
                    <input type="hidden" name="id" value={task.id} />
                    {#if task.status !== 'done'}
                      <input type="hidden" name="status" value="done" />
                      <button type="submit" class="text-xs text-[var(--cs-primary)] hover:underline">Complete</button>
                    {/if}
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<!-- Create / Edit Task Modal -->
<Modal open={showCreateForm || editingTask !== null} title={editingTask ? 'Edit Task' : 'New Task'} onclose={() => { showCreateForm = false; editingTask = null; }}>
  {#key editingTask?.id ?? 'create'}
  <form
    method="POST"
    action={editingTask ? '?/updateTask' : '?/createTask'}
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        submitting = false;
        await update();
      };
    }}
    class="space-y-4"
  >
    {#if editingTask}<input type="hidden" name="id" value={editingTask.id} />{/if}

    <div>
      <label for="task-title" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Title</label>
      <input
        id="task-title"
        name="title"
        type="text"
        required
        value={editingTask?.title ?? ''}
        placeholder="Task title..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div>
      <label for="task-description" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Description</label>
      <textarea
        id="task-description"
        name="description"
        rows="3"
        placeholder="Optional description..."
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] placeholder:text-[var(--cs-text-muted)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      >{editingTask?.description ?? ''}</textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="task-priority" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Priority</label>
        <select
          id="task-priority"
          name="priority"
          value={editingTask?.priority ?? 'medium'}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      <div>
        <label for="task-status" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Status</label>
        <select
          id="task-status"
          name="status"
          value={editingTask?.status ?? 'backlog'}
          class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
        >
          <option value="backlog">Backlog</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
        </select>
      </div>
    </div>

    <div>
      <label for="task-due" class="block text-sm font-medium text-[var(--cs-text-secondary)]">Due Date</label>
      <input
        id="task-due"
        name="dueDate"
        type="date"
        value={editingTask?.dueDate?.slice(0, 10) ?? ''}
        class="mt-1 block w-full rounded-md border border-[var(--cs-input-border)] bg-[var(--cs-input-bg)] px-3 py-2 text-sm text-[var(--cs-text)] focus:border-[var(--cs-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--cs-ring)]"
      />
    </div>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={() => { showCreateForm = false; editingTask = null; }}
        class="rounded-md border border-[var(--cs-border)] px-3 py-1.5 text-sm text-[var(--cs-text-secondary)] hover:bg-[var(--cs-bg-inset)]"
      >Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="rounded-md bg-[var(--cs-primary)] px-3 py-1.5 text-sm font-medium text-[var(--cs-text-on-primary)] hover:bg-[var(--cs-primary-hover)] disabled:opacity-50"
      >{submitting ? 'Saving...' : editingTask ? 'Save changes' : 'Create Task'}</button>
    </div>
  </form>
  {/key}
</Modal>
