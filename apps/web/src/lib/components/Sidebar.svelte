<script lang="ts">
  import { page } from '$app/stores';

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
    { href: '/members', label: 'Members', icon: '👥' },
    { href: '/invitations', label: 'Invitations', icon: '✉' },
    { href: '/proposals', label: 'Proposals', icon: '📋' },
    { href: '/agreements', label: 'Agreements', icon: '📝' },
  ];

  const bottomItems = [
    { href: '/cooperative', label: 'Co-op Settings', icon: '⚙' },
  ];

  function isActive(href: string): boolean {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  }
</script>

<aside class="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
  <div class="flex h-14 items-center border-b border-gray-200 px-4">
    <span class="text-sm font-semibold text-gray-900">Co-op Source</span>
  </div>

  <nav class="flex flex-1 flex-col p-2">
    <ul class="space-y-0.5">
      {#each navItems as item}
        <li>
          <a
            href={item.href}
            class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors
              {isActive(item.href)
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'}"
          >
            <span class="w-4 text-center text-base">{item.icon}</span>
            {item.label}
          </a>
        </li>
      {/each}
    </ul>

    <div class="mt-auto pt-2">
      <ul class="space-y-0.5 border-t border-gray-200 pt-2">
        {#each bottomItems as item}
          <li>
            <a
              href={item.href}
              class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors
                {isActive(item.href)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'}"
            >
              <span class="w-4 text-center text-base">{item.icon}</span>
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </nav>
</aside>
