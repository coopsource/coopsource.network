/**
 * Capability-based permission system.
 *
 * Roles map to granular permissions with inheritance.
 * The `'*'` wildcard grants all permissions (admin only).
 */

export const PERMISSIONS = {
  'member.invite': 'Invite new members',
  'member.approve': 'Approve membership requests',
  'member.remove': 'Remove members',
  'member.roles.assign': 'Assign roles to members',
  'proposal.create': 'Create governance proposals',
  'proposal.open': 'Open proposals for voting',
  'proposal.close': 'Close voting on proposals',
  'proposal.resolve': 'Resolve proposal outcomes',
  'vote.cast': 'Cast votes on proposals',
  'agreement.create': 'Create agreements',
  'agreement.sign': 'Sign agreements',
  'agreement.amend': 'Amend existing agreements',
  'post.create': 'Create discussion posts',
  'post.moderate': 'Moderate posts',
  'project.create': 'Create projects',
  'project.manage': 'Manage project settings',
  'coop.settings.edit': 'Edit cooperative settings',
  'coop.roles.manage': 'Manage role definitions',
  'coop.billing.manage': 'Manage billing and subscriptions',
  'funding.manage': 'Manage funding and payment provider settings',
  'network.create': 'Create networks',
  'network.manage': 'Manage network membership',
  'network.coop.approve': 'Approve cooperatives joining network',
  'network.coop.remove': 'Remove cooperatives from network',
  'agent.configure': 'Configure AI agents and model providers',
  'agent.use': 'Interact with AI agents',
  'agent.admin': 'Manage all agent settings and budgets',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const BUILT_IN_ROLES: Record<
  string,
  { permissions: Permission[]; inherits?: string[] }
> = {
  member: {
    permissions: [
      'proposal.create',
      'vote.cast',
      'agreement.sign',
      'post.create',
      'project.create',
      'agent.use',
    ],
  },
  coordinator: {
    permissions: [
      'member.invite',
      'member.approve',
      'member.roles.assign',
      'proposal.open',
      'proposal.close',
      'proposal.resolve',
      'agreement.create',
      'agreement.amend',
      'post.moderate',
      'project.manage',
      'coop.settings.edit',
      'coop.roles.manage',
      'funding.manage',
      'network.create',
      'network.manage',
      'agent.configure',
    ],
    inherits: ['member'],
  },
  admin: { permissions: ['*' as Permission] },
  observer: { permissions: ['vote.cast'] },
};
