import { beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { DashboardService } from '../src/services/dashboard-service.js';
import { ReportingService } from '../src/services/reporting-service.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { truncateAllTables } from './helpers/test-db.js';

describe('Dashboard and reporting membership counts', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('routes projection counts through the membership read model', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    await seedMembershipProjection(
      testApp.container.db,
      coopDid,
      'did:web:suspended.example',
      'suspended',
    );
    await seedMembershipProjection(
      testApp.container.db,
      coopDid,
      'did:web:invalidated.example',
      'active',
      new Date(),
    );

    const dashboardService = new DashboardService(
      testApp.container.db,
      testApp.container.membershipReadModel,
    );
    const reportingService = new ReportingService(
      testApp.container.db,
      testApp.clock,
      testApp.container.membershipReadModel,
    );

    const engagement = await dashboardService.getMemberEngagement(
      coopDid,
      '2026-01-01',
      '2026-12-31',
    );
    expect(engagement.memberCount).toBe(3);
    expect(engagement.activeMemberCount).toBe(1);

    const report = await reportingService.generateReport(coopDid, adminDid, {
      reportType: 'annual',
      title: 'Annual Report',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
    const data = parseReportData(report.data);
    expect(data.memberCount).toBe(1);
  });
});

async function seedMembershipProjection(
  db: Kysely<Database>,
  cooperativeDid: string,
  memberDid: string,
  status: 'active' | 'suspended',
  invalidatedAt: Date | null = null,
): Promise<void> {
  await db
    .insertInto('entity')
    .values({
      did: memberDid,
      type: 'person',
      display_name: memberDid,
      status: 'active',
      created_at: new Date(),
    })
    .execute();
  await db
    .insertInto('membership')
    .values({
      member_did: memberDid,
      cooperative_did: cooperativeDid,
      status,
      created_at: new Date(),
      indexed_at: new Date(),
      invalidated_at: invalidatedAt,
    })
    .execute();
}

function parseReportData(data: unknown): Record<string, unknown> {
  if (typeof data === 'string') {
    return JSON.parse(data) as Record<string, unknown>;
  }
  return data as Record<string, unknown>;
}
