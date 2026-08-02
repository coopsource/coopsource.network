import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { CsnDbGovernanceRecordPlacementPort } from '../src/services/governance-record-placement-port.js';

/**
 * Audit finding C-03: write placement keyed on the cooperative's governance
 * visibility alone, ignoring record lifecycle and the collection's declared
 * confidentiality. In `open` or `mixed` cooperatives a proposal was published
 * to the public repo while its own state was still `draft`, and stakeholder
 * terms and pledges took public write paths despite permissioned placement
 * declarations.
 *
 * ARCHITECTURE-V12 §8 places draft proposals and financials in Tier 2:
 * "Never on the public firehose." Publication is irreversible — relay, crawler,
 * and archive copies survive deletion — so placement fails closed.
 */
const COOP = 'did:web:placement.example';

describe('Tier 2 placement containment (C-03)', () => {
  let port: CsnDbGovernanceRecordPlacementPort;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    port = new CsnDbGovernanceRecordPlacementPort(getTestDb());
    await getTestDb()
      .insertInto('entity')
      .values({ did: COOP, type: 'cooperative', display_name: 'Placement Coop' })
      .execute();
  });

  async function setVisibility(visibility: string): Promise<void> {
    await getTestDb()
      .insertInto('cooperative_profile')
      .values({
        entity_did: COOP,
        cooperative_type: 'worker',
        is_network: false,
        governance_visibility: visibility,
      })
      .onConflict((c) => c.column('entity_did').doUpdateSet({ governance_visibility: visibility }))
      .execute();
  }

  const tier2Collections = [
    'network.coopsource.agreement.stakeholderTerms',
    'network.coopsource.funding.pledge',
    'network.coopsource.ops.timeEntry',
    'network.coopsource.agreement.contribution',
    'network.coopsource.finance.expense',
    'network.coopsource.finance.revenue',
    'network.coopsource.legal.document',
    'network.coopsource.legal.meetingRecord',
    'network.coopsource.admin.memberNotice',
  ];

  /**
   * The invariant is that a Tier 2 collection never reaches the public repo.
   * Resolving to a permissioned space satisfies it; so does refusing outright
   * when the caller has not named which role or member-class space applies,
   * because the write then fails instead of leaking.
   */
  async function resolvedKind(
    collection: string,
    space?: { arbiterDid: string; spaceKey: string; expectedSpaceType: string },
  ): Promise<string> {
    try {
      const placement = await port.resolveWritePlacement({
        cooperativeDid: COOP,
        collection,
        ...(space ? { space: space as never } : {}),
      });
      return placement.kind;
    } catch {
      return 'refused';
    }
  }

  for (const visibility of ['open', 'mixed']) {
    for (const collection of tier2Collections) {
      it(`keeps ${collection.split('.').slice(-1)[0]} off the public repo under ${visibility} visibility`, async () => {
        await setVisibility(visibility);

        expect(await resolvedKind(collection)).not.toBe('public-repo');
      });
    }
  }

  it('places a Tier 2 record in the named space when the caller supplies one', async () => {
    await setVisibility('open');

    const kind = await resolvedKind('network.coopsource.funding.pledge', {
      arbiterDid: COOP,
      spaceKey: 'classes/worker',
      expectedSpaceType: 'network.coopsource.org.spaceType.memberClass',
    });

    expect(kind).toBe('permissioned-space');
  });

  it('keeps a draft proposal off the public repo under open visibility', async () => {
    await setVisibility('open');

    const placement = await port.resolveWritePlacement({
      cooperativeDid: COOP,
      collection: 'network.coopsource.governance.proposal',
      lifecycleState: 'draft',
    });

    expect(placement.kind).toBe('permissioned-space');
  });

  it('a caller cannot override a Tier 2 collection to public', async () => {
    await setVisibility('open');

    const attempt = port.resolveWritePlacement({
      cooperativeDid: COOP,
      collection: 'network.coopsource.funding.pledge',
      visibilityOverride: 'public',
      space: {
        arbiterDid: COOP,
        spaceKey: 'classes/worker',
        expectedSpaceType: 'network.coopsource.org.spaceType.memberClass',
      } as never,
    });

    expect((await attempt).kind).toBe('permissioned-space');
  });

  it('a caller cannot override a draft proposal to public', async () => {
    await setVisibility('open');

    const placement = await port.resolveWritePlacement({
      cooperativeDid: COOP,
      collection: 'network.coopsource.governance.proposal',
      lifecycleState: 'draft',
      visibilityOverride: 'public',
    });

    expect(placement.kind).toBe('permissioned-space');
  });

  it('still publishes a published proposal under open visibility', async () => {
    await setVisibility('open');

    const placement = await port.resolveWritePlacement({
      cooperativeDid: COOP,
      collection: 'network.coopsource.governance.proposal',
      lifecycleState: 'published',
    });

    expect(placement.kind).toBe('public-repo');
  });

  it('never publishes a permissioned space URI on a public record', async () => {
    // A vote is a members-space collection, so under `open` visibility it is
    // published. Its proposal is now Tier 2, and the permissioned URI names the
    // cooperative, the collection, the rkey, and the DID of the member who
    // authored the proposal — so publishing a reference to it puts Tier 2
    // metadata on the public firehose (ARCHITECTURE-V12 §8).
    const app = createTestApp();
    await setupAndLogin(app);

    const created = await app.agent
      .post('/api/v1/proposals')
      .send({ title: 'Sensitive', body: 'Body', votingType: 'binary', quorumType: 'simpleMajority' })
      .expect(201);
    await app.agent.post(`/api/v1/proposals/${created.body.id}/open`).expect(200);
    await app.agent
      .post(`/api/v1/proposals/${created.body.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    const publicRecords = await getTestDb()
      .selectFrom('pds_record')
      .select(['uri', 'content'])
      .execute();

    for (const record of publicRecords) {
      const content =
        typeof record.content === 'string' ? record.content : JSON.stringify(record.content);
      expect(content).not.toContain('/space/');
      expect(content).not.toContain('"private"');
    }
  });

  it('still keeps everything permissioned under closed visibility', async () => {
    await setVisibility('closed');

    const placement = await port.resolveWritePlacement({
      cooperativeDid: COOP,
      collection: 'network.coopsource.governance.proposal',
      lifecycleState: 'published',
    });

    expect(placement.kind).toBe('permissioned-space');
  });
});
