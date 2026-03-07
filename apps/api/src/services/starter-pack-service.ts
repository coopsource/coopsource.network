import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import type { IPdsService } from '@coopsource/federation';
import { logger } from '../middleware/logger.js';

/**
 * Manages Bluesky Starter Packs for cooperative onboarding.
 *
 * Creates/updates `app.bsky.graph.list` and `app.bsky.graph.starterpack`
 * records in the cooperative's PDS when membership changes occur.
 *
 * Best-effort — if PDS writes fail, logs and continues.
 */
export class StarterPackService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
  ) {}

  /**
   * Called when a member becomes active. Adds them to the cooperative's
   * member list (for Starter Pack).
   */
  async onMemberActivated(cooperativeDid: string, memberDid: string): Promise<void> {
    try {
      await this.pdsService.createRecord({
        did: cooperativeDid as DID,
        collection: 'app.bsky.graph.listitem',
        record: {
          $type: 'app.bsky.graph.listitem',
          subject: memberDid,
          list: `at://${cooperativeDid}/app.bsky.graph.list/members`,
          createdAt: new Date().toISOString(),
        },
      });
      logger.info({ cooperativeDid, memberDid }, 'Added member to starter pack list');
    } catch (err) {
      logger.warn({ err, cooperativeDid, memberDid }, 'Failed to add member to starter pack list');
    }
  }

  /**
   * Called when a member is revoked. Removes them from the cooperative's
   * member list.
   */
  async onMemberRevoked(cooperativeDid: string, memberDid: string): Promise<void> {
    try {
      // Find and delete the list item for this member
      const records = await this.pdsService.listRecords(
        cooperativeDid as DID,
        'app.bsky.graph.listitem',
      );

      for (const record of records) {
        if (
          record.value &&
          typeof record.value === 'object' &&
          'subject' in record.value &&
          record.value.subject === memberDid
        ) {
          await this.pdsService.deleteRecord({
            did: cooperativeDid as DID,
            collection: 'app.bsky.graph.listitem',
            rkey: record.uri.split('/').pop()!,
          });
          logger.info({ cooperativeDid, memberDid }, 'Removed member from starter pack list');
          break;
        }
      }
    } catch (err) {
      logger.warn({ err, cooperativeDid, memberDid }, 'Failed to remove member from starter pack list');
    }
  }

  /**
   * Ensure a cooperative has a starter pack list and pack record.
   * Called once during cooperative setup.
   */
  async ensureStarterPack(cooperativeDid: string, cooperativeName: string): Promise<void> {
    try {
      // Create/update the member list
      await this.pdsService.putRecord({
        did: cooperativeDid as DID,
        collection: 'app.bsky.graph.list',
        rkey: 'members',
        record: {
          $type: 'app.bsky.graph.list',
          purpose: 'app.bsky.graph.defs#curatelist',
          name: `${cooperativeName} Members`,
          description: `Active members of ${cooperativeName}`,
          createdAt: new Date().toISOString(),
        },
      });

      // Create/update the starter pack
      await this.pdsService.putRecord({
        did: cooperativeDid as DID,
        collection: 'app.bsky.graph.starterpack',
        rkey: 'onboarding',
        record: {
          $type: 'app.bsky.graph.starterpack',
          name: `Join ${cooperativeName}`,
          description: `Join ${cooperativeName} governance on Co-op Source Network`,
          list: `at://${cooperativeDid}/app.bsky.graph.list/members`,
          createdAt: new Date().toISOString(),
        },
      });

      logger.info({ cooperativeDid }, 'Starter pack ensured');
    } catch (err) {
      logger.warn({ err, cooperativeDid }, 'Failed to ensure starter pack');
    }
  }
}
