import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { GovernanceLabeler } from '../src/services/governance-labeler.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';

let testApp: TestApp;
let labeler: GovernanceLabeler;
let db: Kysely<Database>;

beforeAll(() => {
  testApp = createTestApp();
  db = testApp.container.db;
  labeler = testApp.container.governanceLabeler;
});

beforeEach(async () => {
  await db.deleteFrom('governance_label').execute();
});

describe('GovernanceLabeler', () => {
  it('emits a label and retrieves it by subject', async () => {
    await labeler.emitLabel(
      'did:plc:coop1',
      'at://did:plc:coop1/network.coopsource.governance.proposal/abc',
      'proposal-approved',
      'bafycid123',
    );

    const labels = await labeler.getLabelsForSubject(
      'at://did:plc:coop1/network.coopsource.governance.proposal/abc',
    );

    expect(labels).toHaveLength(1);
    expect(labels[0]!.srcDid).toBe('did:plc:coop1');
    expect(labels[0]!.labelValue).toBe('proposal-approved');
    expect(labels[0]!.neg).toBe(false);
  });

  it('queries labels by value', async () => {
    await labeler.emitLabel('did:plc:coop1', 'at://did:plc:coop1/proposal/1', 'proposal-approved');
    await labeler.emitLabel('did:plc:coop2', 'at://did:plc:coop2/proposal/2', 'proposal-approved');
    await labeler.emitLabel('did:plc:coop1', 'at://did:plc:coop1/proposal/3', 'proposal-rejected');

    const approved = await labeler.queryLabels('proposal-approved');
    expect(approved).toHaveLength(2);

    const rejected = await labeler.queryLabels('proposal-rejected');
    expect(rejected).toHaveLength(1);
  });

  it('negates a label', async () => {
    await labeler.emitLabel('did:plc:coop1', 'at://did:plc:coop1/proposal/1', 'proposal-active');
    await labeler.negateLabel('did:plc:coop1', 'at://did:plc:coop1/proposal/1', 'proposal-active');

    const labels = await labeler.getLabelsForSubject('at://did:plc:coop1/proposal/1');
    expect(labels).toHaveLength(2);
    const hasPositive = labels.some((l) => l.neg === false);
    const hasNegation = labels.some((l) => l.neg === true);
    expect(hasPositive).toBe(true);
    expect(hasNegation).toBe(true);
  });

  it('queryLabels excludes negated labels', async () => {
    await labeler.emitLabel('did:plc:coop1', 'at://did:plc:coop1/proposal/1', 'proposal-active');
    await labeler.negateLabel('did:plc:coop1', 'at://did:plc:coop1/proposal/1', 'proposal-active');

    const labels = await labeler.queryLabels('proposal-active');
    expect(labels).toHaveLength(1);
    expect(labels[0]!.neg).toBe(false);
  });

  it('supports all governance label values', async () => {
    const values = [
      'proposal-active',
      'proposal-approved',
      'proposal-rejected',
      'proposal-archived',
      'member-suspended',
      'agreement-ratified',
    ] as const;

    for (const value of values) {
      await labeler.emitLabel('did:plc:coop1', `at://did:plc:coop1/record/${value}`, value);
    }

    for (const value of values) {
      const labels = await labeler.queryLabels(value);
      expect(labels).toHaveLength(1);
      expect(labels[0]!.labelValue).toBe(value);
    }
  });

  it('respects limit parameter in queryLabels', async () => {
    for (let i = 0; i < 5; i++) {
      await labeler.emitLabel('did:plc:coop1', `at://did:plc:coop1/proposal/${i}`, 'proposal-approved');
    }

    const limited = await labeler.queryLabels('proposal-approved', 3);
    expect(limited).toHaveLength(3);
  });

  it('returns empty array for unknown subject', async () => {
    const labels = await labeler.getLabelsForSubject('at://did:plc:nonexistent/record/xyz');
    expect(labels).toHaveLength(0);
  });

  it('returns empty array for unknown label value', async () => {
    const labels = await labeler.queryLabels('nonexistent-label');
    expect(labels).toHaveLength(0);
  });
});
