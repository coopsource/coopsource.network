import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { Kysely } from 'kysely';
import { CsnDbGroupMutationPort } from '../group-mutation-port.js';

interface MembershipFixture {
  id: string;
  member_did: string;
  cooperative_did: string;
  status: string;
  member_class: string | null;
  member_record_uri: string | null;
  member_record_cid: string | null;
  approval_record_uri: string | null;
  approval_record_cid: string | null;
  invited_by_did: string | null;
  invitation_id: string | null;
  joined_at: Date | null;
  departed_at: Date | null;
  status_reason: string | null;
  directory_visible: boolean;
  created_at: Date;
  created_by: string | null;
  invalidated_at: Date | null;
  invalidated_by: string | null;
  indexed_at: Date;
}

interface MembershipRoleFixture {
  membership_id: string;
  role: string;
  indexed_at: Date;
}

interface FactLogFixture {
  id: string;
  entity_type: string;
  entity_id: string;
  field: string;
  old_value: unknown | null;
  new_value: unknown | null;
  changed_by: string | null;
  changed_at: Date;
  reason: string | null;
  ip_address: string | null;
}

interface FakeState {
  memberships: MembershipFixture[];
  roles: MembershipRoleFixture[];
  audits: FactLogFixture[];
  nextMembershipId: number;
  nextAuditId: number;
}

type FakeRow = MembershipFixture | MembershipRoleFixture | FactLogFixture;
type Predicate = (row: FakeRow) => boolean;

const cooperativeDid = 'did:plc:coop' as DID;
const aliceDid = 'did:plc:alice' as DID;
const bobDid = 'did:plc:bob' as DID;
const actorDid = 'did:plc:admin' as DID;
const now = new Date('2026-05-18T12:00:00Z');

describe('CsnDbGroupMutationPort', () => {
  it('mutates without opening a nested transaction when given an already-open transaction', async () => {
    const { db, state } = fakeDb();
    // Mirror real Kysely Transaction semantics: `isTransaction` is true and
    // calling `.transaction()` throws. FakeDb's permissive transaction()
    // masked this, which is how the setup.ts regression slipped through.
    const trx = Object.create(db as object) as Kysely<Database>;
    Object.defineProperty(trx, 'isTransaction', { value: true });
    Object.defineProperty(trx, 'transaction', {
      value: () => {
        throw new Error('calling the transaction method for a Transaction is not supported');
      },
    });
    const authority = new CsnDbGroupMutationPort(trx, { now: () => now });

    const result = await authority.addMember({
      cooperativeDid,
      memberDid: aliceDid,
      actorDid,
      roles: ['member'],
      consentRecordUri: 'at://alice/memberConsent/1',
      consentRecordCid: 'cid-1',
    });

    expect(result).toMatchObject({ ok: true, changed: true, memberDid: aliceDid });
    expect(state.memberships).toHaveLength(1);
  });

  it('defaults directory_visible to false — directory visibility is opt-in', async () => {
    const { db, state } = fakeDb();
    const authority = new CsnDbGroupMutationPort(db, { now: () => now });

    await authority.addMember({
      cooperativeDid,
      memberDid: aliceDid,
      actorDid,
      consentRecordUri: 'at://alice/memberConsent/1',
      consentRecordCid: 'cid-1',
    });

    expect(state.memberships[0]).toMatchObject({ directory_visible: false });
  });

  it('adds active members, role memberships, and an audit event', async () => {
    const { db, state } = fakeDb();
    const authority = new CsnDbGroupMutationPort(db, { now: () => now });

    const result = await authority.addMember({
      cooperativeDid,
      memberDid: aliceDid,
      actorDid,
      roles: ['member', 'admin'],
      consentRecordUri: 'at://alice/memberConsent/1',
      consentRecordCid: 'cid-1',
      reason: 'test add',
      auditMetadata: { source: 'test' },
      governanceOutcomeRef: 'at://did:plc:coop/network.coopsource.governance.proposal/p1',
    });

    expect(result).toMatchObject({ ok: true, changed: true, memberDid: aliceDid });
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({
      member_did: aliceDid,
      cooperative_did: cooperativeDid,
      status: 'active',
      member_record_uri: 'at://alice/memberConsent/1',
      approval_record_uri: null,
    });
    expect(state.roles.map((row) => row.role)).toEqual(['admin', 'member']);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      entity_type: 'v11.groupMutation',
      field: 'add-member',
      changed_by: actorDid,
      reason: 'test add',
    });
    expect(state.audits[0]!.new_value).toMatchObject({
      cooperativeDid,
      operation: 'add-member',
      actorDid,
      memberDid: aliceDid,
      consentRecordUri: 'at://alice/memberConsent/1',
      consentRecordCid: 'cid-1',
      auditMetadata: { source: 'test' },
      governanceOutcomeRef: 'at://did:plc:coop/network.coopsource.governance.proposal/p1',
    });
  });

  it('activates an existing pending membership without duplicating the row', async () => {
    const { db, state } = fakeDb({
      memberships: [membership('m1', aliceDid, { status: 'pending', joinedAt: null })],
      roles: [{ membership_id: 'm1', role: 'member', indexed_at: new Date('2026-05-17T00:00:00Z') }],
    });
    const authority = new CsnDbGroupMutationPort(db, { now: () => now });

    const result = await authority.addMember({
      cooperativeDid,
      memberDid: aliceDid,
      actorDid,
      roles: ['admin'],
    });

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({
      id: 'm1',
      status: 'active',
      joined_at: now,
    });
    expect(state.roles).toEqual([{ membership_id: 'm1', role: 'admin', indexed_at: now }]);
  });

  it('sets member roles idempotently', async () => {
    const { db, state } = fakeDb({
      memberships: [membership('m1', aliceDid)],
      roles: [{ membership_id: 'm1', role: 'member', indexed_at: now }],
    });
    const authority = new CsnDbGroupMutationPort(db, { now: () => now });

    await expect(
      authority.setMemberRoles({ cooperativeDid, memberDid: aliceDid, actorDid, roles: ['member', 'admin'] }),
    ).resolves.toMatchObject({ ok: true, changed: true });

    await expect(
      authority.setMemberRoles({ cooperativeDid, memberDid: aliceDid, actorDid, roles: ['admin', 'member'] }),
    ).resolves.toMatchObject({ ok: true, changed: false });

    expect(state.roles.map((row) => row.role)).toEqual(['admin', 'member']);
    expect(state.audits.map((row) => row.field)).toEqual(['set-member-roles']);
  });

  it('removes members with departed state and invalidation actor', async () => {
    const { db, state } = fakeDb({
      memberships: [membership('m1', aliceDid)],
      roles: [{ membership_id: 'm1', role: 'member', indexed_at: now }],
    });
    const authority = new CsnDbGroupMutationPort(db, { now: () => now });

    await expect(
      authority.removeMember({ cooperativeDid, memberDid: aliceDid, actorDid, reason: 'left' }),
    ).resolves.toMatchObject({ ok: true, changed: true });

    expect(state.memberships[0]).toMatchObject({
      status: 'departed',
      status_reason: 'left',
      departed_at: now,
      invalidated_at: now,
      invalidated_by: actorDid,
    });

    await expect(
      authority.removeMember({ cooperativeDid, memberDid: bobDid, actorDid }),
    ).resolves.toMatchObject({ ok: true, changed: false, reason: 'not-found' });
  });

  it('requires active membership before adding role membership', async () => {
    const { db, state } = fakeDb({
      memberships: [membership('m1', aliceDid, { status: 'pending' })],
    });
    const authority = new CsnDbGroupMutationPort(db, { now: () => now });

    await expect(
      authority.addRoleMember({ cooperativeDid, memberDid: aliceDid, actorDid, role: 'admin' }),
    ).resolves.toMatchObject({ ok: false, changed: false, reason: 'not-found' });
    expect(state.roles).toEqual([]);
  });

  it('lists audit events with opaque cursors', async () => {
    const { db } = fakeDb();
    const authority = new CsnDbGroupMutationPort(db, { now: () => now });
    await authority.addMember({ cooperativeDid, memberDid: aliceDid, actorDid, roles: ['member'] });
    await authority.addMember({ cooperativeDid, memberDid: bobDid, actorDid, roles: ['member'] });

    const firstPage = await authority.listAuditEvents({ cooperativeDid, limit: 1 });
    expect(firstPage.events).toHaveLength(1);
    expect(firstPage.cursor).toBeDefined();

    const secondPage = await authority.listAuditEvents({ cooperativeDid, limit: 1, cursor: firstPage.cursor });
    expect(secondPage.events).toHaveLength(1);
    expect(secondPage.events[0]!.memberDid).not.toBe(firstPage.events[0]!.memberDid);
  });
});

function fakeDb(fixtures: {
  readonly memberships?: ReadonlyArray<MembershipFixture>;
  readonly roles?: ReadonlyArray<MembershipRoleFixture>;
  readonly audits?: ReadonlyArray<FactLogFixture>;
} = {}): { readonly db: Kysely<Database>; readonly state: FakeState } {
  const state: FakeState = {
    memberships: [...(fixtures.memberships ?? [])],
    roles: [...(fixtures.roles ?? [])],
    audits: [...(fixtures.audits ?? [])],
    nextMembershipId: (fixtures.memberships?.length ?? 0) + 1,
    nextAuditId: (fixtures.audits?.length ?? 0) + 1,
  };
  const db = new FakeDb(state) as unknown as Kysely<Database>;
  return { db, state };
}

function membership(
  id: string,
  memberDid: DID,
  options: {
    readonly status?: string;
    readonly joinedAt?: Date | null;
  } = {},
): MembershipFixture {
  return {
    id,
    member_did: memberDid,
    cooperative_did: cooperativeDid,
    status: options.status ?? 'active',
    member_class: null,
    member_record_uri: null,
    member_record_cid: null,
    approval_record_uri: null,
    approval_record_cid: null,
    invited_by_did: null,
    invitation_id: null,
    joined_at: options.joinedAt === undefined ? now : options.joinedAt,
    departed_at: null,
    status_reason: null,
    directory_visible: true,
    created_at: now,
    created_by: actorDid,
    invalidated_at: null,
    invalidated_by: null,
    indexed_at: now,
  };
}

class FakeDb {
  constructor(private readonly state: FakeState) {}

  transaction(): { execute: <T>(fn: (trx: FakeDb) => Promise<T>) => Promise<T> } {
    return {
      execute: (fn) => fn(this),
    };
  }

  selectFrom(table: string): FakeSelectQuery {
    return new FakeSelectQuery(this.state, table);
  }

  insertInto(table: string): FakeInsertQuery {
    return new FakeInsertQuery(this.state, table);
  }

  updateTable(table: string): FakeUpdateQuery {
    return new FakeUpdateQuery(this.state, table);
  }

  deleteFrom(table: string): FakeDeleteQuery {
    return new FakeDeleteQuery(this.state, table);
  }
}

class FakeSelectQuery {
  private readonly predicates: Predicate[] = [];
  private readonly orderings: Array<{ readonly column: string; readonly direction: 'asc' | 'desc' }> = [];
  private maxRows: number | null = null;

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  selectAll(): this {
    return this;
  }

  where(columnOrFactory: string | ((eb: ExpressionBuilder) => Predicate), op?: string, value?: unknown): this {
    if (typeof columnOrFactory === 'function') {
      this.predicates.push(columnOrFactory(createExpressionBuilder()));
      return this;
    }
    this.predicates.push(comparePredicate(columnOrFactory, op ?? '=', value));
    return this;
  }

  orderBy(column: string, direction: 'asc' | 'desc'): this {
    this.orderings.push({ column, direction });
    return this;
  }

  limit(limit: number): this {
    this.maxRows = limit;
    return this;
  }

  async executeTakeFirst(): Promise<FakeRow | undefined> {
    return (await this.execute())[0];
  }

  async execute(): Promise<FakeRow[]> {
    let rows = this.rows().filter((row) => this.predicates.every((predicate) => predicate(row)));
    for (const ordering of this.orderings) {
      rows = [...rows].sort((left, right) => {
        const result = compareValues(valueForColumn(left, ordering.column), valueForColumn(right, ordering.column));
        return ordering.direction === 'asc' ? result : -result;
      });
    }
    return this.maxRows === null ? rows : rows.slice(0, this.maxRows);
  }

  private rows(): FakeRow[] {
    if (this.table === 'membership') return this.state.memberships;
    if (this.table === 'membership_role') return this.state.roles;
    if (this.table === 'fact_log') return this.state.audits;
    throw new Error(`Unsupported fake table: ${this.table}`);
  }
}

class FakeInsertQuery {
  private pendingValues: unknown;

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  values(values: unknown): this {
    this.pendingValues = values;
    return this;
  }

  returning(): this {
    return this;
  }

  async execute(): Promise<Array<{ id: string }>> {
    const values = Array.isArray(this.pendingValues) ? this.pendingValues : [this.pendingValues];
    if (this.table === 'membership') {
      const inserted = values.map((value) => {
        const row = { id: `m${this.state.nextMembershipId++}`, ...(value as object) } as MembershipFixture;
        this.state.memberships.push(row);
        return { id: row.id };
      });
      return inserted;
    }
    if (this.table === 'membership_role') {
      this.state.roles.push(...(values as MembershipRoleFixture[]));
      return [];
    }
    if (this.table === 'fact_log') {
      const inserted = values.map((value) => {
        const row = { id: `a${this.state.nextAuditId++}`, ...(value as object) } as FactLogFixture;
        this.state.audits.push(row);
        return { id: row.id };
      });
      return inserted;
    }
    throw new Error(`Unsupported fake table: ${this.table}`);
  }
}

class FakeUpdateQuery {
  private updates: Partial<MembershipFixture> = {};
  private readonly predicates: Predicate[] = [];

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  set(updates: Partial<MembershipFixture>): this {
    this.updates = updates;
    return this;
  }

  where(column: string, op: string, value: unknown): this {
    this.predicates.push(comparePredicate(column, op, value));
    return this;
  }

  async execute(): Promise<unknown[]> {
    if (this.table !== 'membership') {
      throw new Error(`Unsupported fake table: ${this.table}`);
    }
    for (const row of this.state.memberships) {
      if (this.predicates.every((predicate) => predicate(row))) {
        Object.assign(row, this.updates);
      }
    }
    return [];
  }
}

class FakeDeleteQuery {
  private readonly predicates: Predicate[] = [];

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  where(column: string, op: string, value: unknown): this {
    this.predicates.push(comparePredicate(column, op, value));
    return this;
  }

  async execute(): Promise<unknown[]> {
    if (this.table !== 'membership_role') {
      throw new Error(`Unsupported fake table: ${this.table}`);
    }
    this.state.roles = this.state.roles.filter((row) => !this.predicates.every((predicate) => predicate(row)));
    return [];
  }
}

interface ExpressionBuilder {
  (column: string, op: string, value: unknown): Predicate;
  and: (predicates: ReadonlyArray<Predicate>) => Predicate;
  or: (predicates: ReadonlyArray<Predicate>) => Predicate;
}

function createExpressionBuilder(): ExpressionBuilder {
  const eb = ((column: string, op: string, value: unknown) => comparePredicate(column, op, value)) as ExpressionBuilder;
  eb.and = (predicates) => (row) => predicates.every((predicate) => predicate(row));
  eb.or = (predicates) => (row) => predicates.some((predicate) => predicate(row));
  return eb;
}

function comparePredicate(column: string, op: string, value: unknown): Predicate {
  return (row) => {
    const actual = valueForColumn(row, column);
    if (op === '=') return compareValues(actual, value) === 0;
    if (op === '<') return compareValues(actual, value) < 0;
    if (op === 'is') return actual === value;
    if (op === 'like') {
      const prefix = String(value).replace(/%$/, '');
      return String(actual).startsWith(prefix);
    }
    throw new Error(`Unsupported fake operator: ${op}`);
  };
}

function valueForColumn(row: FakeRow, column: string): unknown {
  if (column === 'id') return 'id' in row ? row.id : undefined;
  if (column in row) return row[column as keyof FakeRow];
  throw new Error(`Unsupported fake column: ${column}`);
}

function compareValues(left: unknown, right: unknown): number {
  const normalizedLeft = left instanceof Date ? left.valueOf() : left;
  const normalizedRight = right instanceof Date ? right.valueOf() : right;
  if (normalizedLeft === normalizedRight) return 0;
  if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
    return normalizedLeft > normalizedRight ? 1 : -1;
  }
  return String(normalizedLeft) > String(normalizedRight) ? 1 : -1;
}
