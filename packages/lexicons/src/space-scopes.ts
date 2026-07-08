import type { SpaceTypeDeclaration } from './space-types.js';

export type SpaceScopeAction =
  | 'read_self'
  | 'read'
  | 'create'
  | 'update'
  | 'delete';
export type SpaceScopeManageAction = 'create' | 'update' | 'delete';

export interface SpaceScopeOptions {
  readonly authority?: string;
  readonly skey?: string;
  readonly collections?: readonly string[];
  readonly actions?: readonly SpaceScopeAction[];
  readonly manage?: readonly SpaceScopeManageAction[];
}

export function formatSpaceScope(
  spaceType: string | SpaceTypeDeclaration,
  options: SpaceScopeOptions,
): string {
  const spaceTypeId = typeof spaceType === 'string' ? spaceType : spaceType.id;
  const actions = unique(options.actions ?? []);
  const manage = unique(options.manage ?? []);

  if (actions.length === 0 && manage.length === 0) {
    throw new Error(
      'formatSpaceScope requires at least one action or manage operation',
    );
  }

  const params: string[] = [];
  appendParam(params, 'authority', options.authority);
  appendParam(params, 'skey', options.skey);
  for (const collection of unique(options.collections ?? [])) {
    appendParam(params, 'collection', collection);
  }
  for (const action of actions) {
    appendParam(params, 'action', action);
  }
  for (const manageAction of manage) {
    appendParam(params, 'manage', manageAction);
  }

  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return `space:${spaceTypeId}${query}`;
}

export function formatSpaceReadScope(
  spaceType: string | SpaceTypeDeclaration,
  options: Omit<SpaceScopeOptions, 'actions' | 'manage'> = {},
): string {
  return formatSpaceScope(spaceType, { ...options, actions: ['read'] });
}

export function formatSpaceReadSelfScope(
  spaceType: string | SpaceTypeDeclaration,
  options: Omit<SpaceScopeOptions, 'actions' | 'manage'> = {},
): string {
  return formatSpaceScope(spaceType, { ...options, actions: ['read_self'] });
}

function appendParam(
  params: string[],
  key: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
