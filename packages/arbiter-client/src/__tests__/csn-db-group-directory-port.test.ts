import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { Kysely } from 'kysely';
import { CsnDbGroupDirectoryPort, membersSpace, roleSpace } from '../index.js';

interface MembershipFixture {
  readonly id: string;
  readonly cooperative_did: string;
  readonly member_did: string;
  readonly status: string;
  readonly member_class: string | null;
  readonly invalidated_at: Date | null;
  readonly indexed_at: Date;
}

interface MembershipRoleFixture {
  readonly membership_id: string;
  readonly role: string;
  readonly indexed_at: Date;
}

interface FixtureRow {
  readonly id: string;
  readonly member_did: string;
  readonly indexed_at: Date;
  readonly role_indexed_at?: Date;
  readonly membership: MembershipFixture;
  readonly membership_role?: MembershipRoleFixture;
}

type Predicate = (row: FixtureRow) => boolean;

const cooperativeDid = 'did:plc:coop' as DID;
const aliceDid = 'did:plc:alice' as DID;
const bobDid = 'did:plc:bob' as DID;
const chandraDid = 'did:plc:chandra' as DID;

describe('CsnDbGroupDirectoryPort', () => {
  it('treats only active non-invalidated rows as members of the members space', async () => {
    const directory = new CsnDbGroupDirectoryPort(
      fakeDb({
        memberships: [
          membership('m1', aliceDid, 'active'),
          membership('m2', bobDid, 'pending'),
          membership('m3', chandraDid, 'active', { invalidatedAt: new Date('2026-01-02T00:00:00Z') }),
        ],
      }),
    );

    const resolved = await directory.resolveSpaceMembers({ ...membersSpace(cooperativeDid), consistency: 'strict' });
    expect(resolved.ok).toBe(true);
    expect(resolved.members.map((member) => member.did)).toEqual([aliceDid]);
  });

  it('requires the matching role for role spaces', async () => {
    const directory = new CsnDbGroupDirectoryPort(
      fakeDb({
        memberships: [membership('m1', aliceDid, 'active'), membership('m2', bobDid, 'active')],
        roles: [
          { membership_id: 'm1', role: 'admin', indexed_at: new Date('2026-01-03T00:00:00Z') },
          { membership_id: 'm2', role: 'member', indexed_at: new Date('2026-01-03T00:00:00Z') },
        ],
      }),
    );

    const resolved = await directory.resolveSpaceMembers({ ...roleSpace(cooperativeDid, 'admin'), consistency: 'projection-ok' });
    expect(resolved.members.map((member) => member.did)).toEqual([aliceDid]);
  });

  it('orders resolved membership by indexed_at and membership id', async () => {
    const sameTime = new Date('2026-01-01T00:00:00Z');
    const directory = new CsnDbGroupDirectoryPort(
      fakeDb({
        memberships: [
          membership('m2', bobDid, 'active', { indexedAt: sameTime }),
          membership('m1', aliceDid, 'active', { indexedAt: sameTime }),
          membership('m3', chandraDid, 'active', { indexedAt: new Date('2026-01-02T00:00:00Z') }),
        ],
      }),
    );

    const resolved = await directory.resolveSpaceMembers({ ...membersSpace(cooperativeDid), consistency: 'strict' });
    expect(resolved.members.map((member) => member.did)).toEqual([aliceDid, bobDid, chandraDid]);
    expect(resolved.sourceRevision).toBe('2026-01-02T00:00:00.000Z');
  });

  it('reports partial resolution when the roster is truncated at the page cap', async () => {
    // pageSize 2, three active members → the roster is truncated, so the
    // consumer must not treat the (incomplete) list as authoritative. Member
    // #3 would otherwise be cross-checked against a partial list and wrongly
    // rejected as a non-member, while partial:false silently hid the gap.
    const directory = new CsnDbGroupDirectoryPort(
      fakeDb({
        memberships: [
          membership('m1', aliceDid, 'active'),
          membership('m2', bobDid, 'active'),
          membership('m3', chandraDid, 'active'),
        ],
      }),
      { pageSize: 2 },
    );

    const resolved = await directory.resolveSpaceMembers({
      ...membersSpace(cooperativeDid),
      consistency: 'strict',
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.partial).toBe(true);
  });

  it('reports partial:false when the roster fits within the page cap', async () => {
    const directory = new CsnDbGroupDirectoryPort(
      fakeDb({
        memberships: [
          membership('m1', aliceDid, 'active'),
          membership('m2', bobDid, 'active'),
        ],
      }),
      { pageSize: 2 },
    );
    const resolved = await directory.resolveSpaceMembers({
      ...membersSpace(cooperativeDid),
      consistency: 'strict',
    });
    expect(resolved.partial).toBe(false);
    expect(resolved.members.map((m) => m.did)).toEqual([aliceDid, bobDid]);
  });

  it('resolves class spaces and fails closed for unknown spaces', async () => {
    const directory = new CsnDbGroupDirectoryPort(fakeDb({
      memberships: [
        membership('m1', aliceDid, 'active', { memberClass: 'worker' }),
        membership('m2', bobDid, 'active', { memberClass: 'consumer' }),
      ],
    }));
    const unknownSpace = {
      arbiterDid: cooperativeDid,
      spaceKey: 'unknown/members',
      expectedSpaceType: 'network.coopsource.org.unknown',
    };

    const classResolved = await directory.resolveSpaceMembers({
      ...roleSpace(cooperativeDid, 'classes/worker'),
      consistency: 'strict',
    });
    expect(classResolved.members.map((member) => member.did)).toEqual([aliceDid]);

    await expect(
      directory.resolveSpaceMembers({
        ...unknownSpace,
        consistency: 'strict',
      }),
    ).resolves.toMatchObject({ ok: false, members: [], stale: true, partial: true });
  });
});

function membership(
  id: string,
  memberDid: DID,
  status: string,
  options: {
    readonly cooperativeDid?: DID;
    readonly indexedAt?: Date;
    readonly invalidatedAt?: Date | null;
    readonly memberClass?: string | null;
  } = {},
): MembershipFixture {
  return {
    id,
    member_did: memberDid,
    cooperative_did: options.cooperativeDid ?? cooperativeDid,
    status,
    member_class: options.memberClass ?? null,
    invalidated_at: options.invalidatedAt ?? null,
    indexed_at: options.indexedAt ?? new Date('2026-01-01T00:00:00Z'),
  };
}

function fakeDb(fixtures: {
  readonly memberships: ReadonlyArray<MembershipFixture>;
  readonly roles?: ReadonlyArray<MembershipRoleFixture>;
}): Kysely<Database> {
  return {
    selectFrom() {
      return new FakeSelectQuery(fixtures);
    },
  } as unknown as Kysely<Database>;
}

class FakeSelectQuery {
  private readonly predicates: Predicate[] = [];
  private readonly orderings: Array<{ readonly column: string; readonly direction: 'asc' | 'desc' }> = [];
  private joinedRoles = false;
  private maxRows: number | null = null;

  constructor(
    private readonly fixtures: {
      readonly memberships: ReadonlyArray<MembershipFixture>;
      readonly roles?: ReadonlyArray<MembershipRoleFixture>;
    },
  ) {}

  innerJoin(): this {
    this.joinedRoles = true;
    return this;
  }

  select(): this {
    return this;
  }

  distinct(): this {
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

  async executeTakeFirst(): Promise<FixtureRow | undefined> {
    return (await this.execute())[0];
  }

  async execute(): Promise<ReadonlyArray<FixtureRow>> {
    let rows = this.makeRows().filter((row) => this.predicates.every((predicate) => predicate(row)));
    for (const ordering of this.orderings) {
      rows = [...rows].sort((left, right) => {
        const result = compareValues(valueForColumn(left, ordering.column), valueForColumn(right, ordering.column));
        return ordering.direction === 'asc' ? result : -result;
      });
    }
    return this.maxRows === null ? rows : rows.slice(0, this.maxRows);
  }

  private makeRows(): FixtureRow[] {
    if (!this.joinedRoles) {
      return this.fixtures.memberships.map((row) => ({
        id: row.id,
        member_did: row.member_did,
        indexed_at: row.indexed_at,
        membership: row,
      }));
    }

    return this.fixtures.memberships.flatMap((membershipRow) =>
      (this.fixtures.roles ?? [])
        .filter((role) => role.membership_id === membershipRow.id)
        .map((role) => ({
          id: membershipRow.id,
          member_did: membershipRow.member_did,
          indexed_at: membershipRow.indexed_at,
          role_indexed_at: role.indexed_at,
          membership: membershipRow,
          membership_role: role,
        })),
    );
  }
}

interface ExpressionBuilder {
  (column: string, op: string, value: unknown): Predicate;
  and: (predicates: ReadonlyArray<Predicate>) => Predicate;
  or: (predicates: ReadonlyArray<Predicate>) => Predicate;
}

function createExpressionBuilder(): ExpressionBuilder {
  const eb = ((column: string, op: string, value: unknown) => comparePredicate(column, op, value)) as ExpressionBuilder;
  eb.and = (predicates: ReadonlyArray<Predicate>) => (row: FixtureRow) =>
    predicates.every((predicate) => predicate(row));
  eb.or = (predicates: ReadonlyArray<Predicate>) => (row: FixtureRow) =>
    predicates.some((predicate) => predicate(row));
  return eb;
}

function comparePredicate(column: string, op: string, value: unknown): Predicate {
  return (row) => {
    const actual = valueForColumn(row, column);
    if (op === '=') return compareValues(actual, value) === 0;
    if (op === '>') return compareValues(actual, value) > 0;
    if (op === 'is') return actual === value;
    throw new Error(`Unsupported fake Kysely operator: ${op}`);
  };
}

function valueForColumn(row: FixtureRow, column: string): unknown {
  switch (column) {
    case 'membership.id':
      return row.membership.id;
    case 'membership.member_did':
      return row.membership.member_did;
    case 'membership.cooperative_did':
      return row.membership.cooperative_did;
    case 'membership.status':
      return row.membership.status;
    case 'membership.member_class':
      return row.membership.member_class;
    case 'membership.invalidated_at':
      return row.membership.invalidated_at;
    case 'membership.indexed_at':
      return row.membership.indexed_at;
    case 'membership_role.role':
      return row.membership_role?.role;
    default:
      throw new Error(`Unsupported fake Kysely column: ${column}`);
  }
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
