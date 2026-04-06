import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { DID, AtUri, CID } from '@coopsource/common';
import { buildAtUri, NotFoundError } from '@coopsource/common';
import type {
  IPdsService,
  CreateDidOptions,
  UpdateDidOptions,
  CreateRecordParams,
  PutRecordParams,
  DeleteRecordParams,
} from '../interfaces/pds-service.js';
import type { IClock } from '../interfaces/clock.js';
import type {
  DidDocument,
  FirehoseEvent,
  ListRecordsOptions,
  PdsRecord,
  RecordRef,
} from '../types.js';
import type { FederationDatabase } from './db-tables.js';
import { PlcClient } from './plc-client.js';
import { LocalPlcClient } from './local-plc-client.js';

type AnyPlcClient = PlcClient | LocalPlcClient;
import { generateTid } from './tid.js';
import { calculateCid, calculateCommitCid } from './cid-utils.js';
import {
  encryptKey,
  decryptKey,
  generateKeyPair,
  publicJwkToMultibase,
} from './did-manager.js';
import { createFirehoseEmitter } from './firehose.js';

/**
 * @deprecated V3 scaffolding — retained for local dev and E2E tests only.
 * In production, use AtprotoPdsService (activated by PDS_URL env var).
 * Will be removed once all dev/test workflows support real PDS containers.
 */
export interface LocalPdsConfig {
  plcUrl: string; // http://localhost:2582 in dev
  instanceUrl: string; // https://acme.example.com
  keyEncKey: string; // 32-byte base64 key for encrypting private keys
  connectionString: string; // pg connection string for LISTEN
}

export class LocalPdsService implements IPdsService {
  private plc: AnyPlcClient;
  private firehoseEmitter: ReturnType<typeof createFirehoseEmitter>;

  constructor(
    private db: Kysely<FederationDatabase>,
    private config: LocalPdsConfig,
    private clock: IClock,
  ) {
    // 'local' = DB-backed PLC (no external service needed, Stage 0-1)
    // any URL = HTTP PLC client (Stage 2+, points to plc.directory or self-hosted)
    this.plc =
      config.plcUrl === 'local'
        ? new LocalPlcClient(db, config.instanceUrl)
        : new PlcClient(config.plcUrl);
    this.firehoseEmitter = createFirehoseEmitter(config.connectionString);
  }

  async createDid(_options: CreateDidOptions): Promise<DidDocument> {
    const { publicJwk, privateJwk } = await generateKeyPair();
    const signingKey = publicJwkToMultibase(publicJwk);
    const handle =
      _options.handle ??
      `entity.${new URL(this.config.instanceUrl).hostname}`;

    const did = await this.plc.create({
      signingKey,
      handle,
      pdsUrl: this.config.instanceUrl,
    });

    await this.db
      .insertInto('entity_key')
      .values({
        entity_did: did,
        key_type: 'ES256',
        public_key_jwk: JSON.stringify(publicJwk),
        private_key_enc: await encryptKey(
          JSON.stringify(privateJwk),
          this.config.keyEncKey,
        ),
        key_purpose: 'signing',
        created_at: this.clock.now(),
      })
      .execute();

    return this.resolveDid(did as DID);
  }

  async resolveDid(did: DID): Promise<DidDocument> {
    const doc = await this.plc.resolve(did);
    return doc as DidDocument;
  }

  async updateDidDocument(
    did: DID,
    updates: UpdateDidOptions,
  ): Promise<DidDocument> {
    const keyRow = await this.db
      .selectFrom('entity_key')
      .where('entity_did', '=', did)
      .where('invalidated_at', 'is', null)
      .where('key_purpose', '=', 'signing')
      .selectAll()
      .executeTakeFirst();

    if (!keyRow) throw new NotFoundError(`No signing key for DID ${did}`);

    const privateJwk = JSON.parse(
      await decryptKey(keyRow.private_key_enc, this.config.keyEncKey),
    ) as object;

    await this.plc.update(did, updates, privateJwk);
    return this.resolveDid(did);
  }

  async createRecord(params: CreateRecordParams): Promise<RecordRef> {
    const record = { $type: params.collection, ...params.record };
    const cid = await calculateCid(record);
    const rkey = params.rkey ?? generateTid();
    const uri = buildAtUri(params.did, params.collection, rkey) as AtUri;

    await this._writeCommit(
      params.did,
      uri,
      cid as CID,
      record,
      'create',
      null,
    );
    return { uri, cid: cid as CID };
  }

  async putRecord(params: PutRecordParams): Promise<RecordRef> {
    const record = { $type: params.collection, ...params.record };
    const cid = await calculateCid(record);
    const uri = buildAtUri(
      params.did,
      params.collection,
      params.rkey,
    ) as AtUri;

    const existing = await this.db
      .selectFrom('pds_record')
      .where('uri', '=', uri)
      .where('deleted_at', 'is', null)
      .select(['cid'])
      .executeTakeFirst();

    const operation = existing ? 'update' : 'create';
    const prevCid = existing?.cid ?? null;

    await this._writeCommit(
      params.did,
      uri,
      cid as CID,
      record,
      operation,
      prevCid,
    );
    return { uri, cid: cid as CID };
  }

  async deleteRecord(params: DeleteRecordParams): Promise<void> {
    const uri = buildAtUri(params.did, params.collection, params.rkey);
    const existing = await this.db
      .selectFrom('pds_record')
      .where('uri', '=', uri)
      .where('deleted_at', 'is', null)
      .select(['cid'])
      .executeTakeFirst();

    if (!existing) throw new NotFoundError(`Record not found: ${uri}`);

    await this._writeCommit(
      params.did,
      uri as AtUri,
      existing.cid as CID,
      undefined,
      'delete',
      existing.cid,
    );
  }

  async getRecord(uri: string): Promise<PdsRecord> {
    const row = await this.db
      .selectFrom('pds_record')
      .where('uri', '=', uri)
      .where('deleted_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError(`Record not found: ${uri}`);

    return {
      uri: row.uri as AtUri,
      cid: row.cid as CID,
      value: row.content as Record<string, unknown>,
      indexedAt: row.indexed_at.toISOString(),
    };
  }

  async listRecords(
    did: DID,
    collection: string,
    options?: ListRecordsOptions,
  ): Promise<PdsRecord[]> {
    const rows = await this.db
      .selectFrom('pds_record')
      .where('did', '=', did)
      .where('collection', '=', collection)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', options?.reverse ? 'asc' : 'desc')
      .limit(options?.limit ?? 50)
      .selectAll()
      .execute();

    return rows.map((row) => ({
      uri: row.uri as AtUri,
      cid: row.cid as CID,
      value: row.content as Record<string, unknown>,
      indexedAt: row.indexed_at.toISOString(),
    }));
  }

  async *subscribeRepos(cursor = 0): AsyncIterable<FirehoseEvent> {
    // Replay backlog from pds_commit (dropped in migration 056 — returns empty after that).
    type CommitRow = {
      global_seq: number;
      did: string;
      operation: string;
      record_uri: string;
      record_cid: string;
      prev_record_cid: string | null;
      committed_at: Date;
    };
    let backlog: CommitRow[] = [];
    try {
      const rows = await sql<CommitRow>`
        SELECT global_seq, did, operation, record_uri, record_cid, prev_record_cid, committed_at
        FROM pds_commit
        WHERE global_seq > ${cursor}
        ORDER BY global_seq ASC
      `.execute(this.db);
      backlog = rows.rows;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('relation') || !msg.includes('does not exist')) {
        throw err;
      }
      // pds_commit table dropped in migration 056 — no backlog to replay
    }

    for (const row of backlog) {
      let record: Record<string, unknown> | undefined;
      if (row.operation !== 'delete') {
        const pdsRecord = await this.db
          .selectFrom('pds_record')
          .where('uri', '=', row.record_uri)
          .select('content')
          .executeTakeFirst();
        record = pdsRecord?.content as Record<string, unknown> | undefined;
      }

      yield {
        seq: row.global_seq,
        did: row.did as DID,
        operation: row.operation as 'create' | 'update' | 'delete',
        uri: row.record_uri as AtUri,
        cid: row.record_cid as CID,
        record,
        prevCid: (row.prev_record_cid as CID) ?? undefined,
        time: row.committed_at.toISOString(),
      };
    }

    // Live events via pg NOTIFY
    yield* this.firehoseEmitter.listen(
      backlog.at(-1)?.global_seq ?? cursor,
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async _writeCommit(
    did: string,
    uri: AtUri,
    cid: CID,
    record: Record<string, unknown> | undefined,
    operation: 'create' | 'update' | 'delete',
    prevCid: string | null,
    _retries = 5,
  ): Promise<void> {
    const now = this.clock.now();
    const commitCid = await calculateCommitCid(cid, prevCid);

    try {
      await this.db.transaction().execute(async (trx) => {
        // Calculate localSeq inside the transaction. The (did, local_seq)
        // unique constraint is the final guard against concurrent races;
        // we retry on violation (see catch below).
        // pds_commit may not exist after V3 cleanup migration (056) — fall back to 0.
        // Use a SAVEPOINT to isolate a potential "relation does not exist" error
        // so the outer transaction is not aborted.
        let localSeq = 1;
        try {
          await sql`SAVEPOINT pds_commit_seq`.execute(trx);
          const seqRows = await sql<{ max_seq: string | null }>`
            SELECT MAX(local_seq) AS max_seq FROM pds_commit WHERE did = ${did}
          `.execute(trx);
          await sql`RELEASE SAVEPOINT pds_commit_seq`.execute(trx);
          localSeq = (Number(seqRows.rows[0]?.max_seq ?? 0) || 0) + 1;
        } catch (seqErr: unknown) {
          await sql`ROLLBACK TO SAVEPOINT pds_commit_seq`.execute(trx).catch(() => {});
          const seqMsg = seqErr instanceof Error ? seqErr.message : '';
          if (!seqMsg.includes('relation') || !seqMsg.includes('does not exist')) {
            throw seqErr;
          }
          // pds_commit table does not exist — localSeq stays at 1
        }

        if (operation === 'create') {
          const uriStr = uri.replace('at://', '');
          const slashIdx = uriStr.indexOf('/');
          const rest = uriStr.slice(slashIdx + 1);
          const collSlashIdx = rest.indexOf('/');
          const collection = rest.slice(0, collSlashIdx);
          const rkey = rest.slice(collSlashIdx + 1);

          await trx
            .insertInto('pds_record')
            .values({
              uri,
              did,
              collection,
              rkey,
              cid,
              content: record!,
              created_at: now,
              indexed_at: now,
            })
            .execute();
        } else if (operation === 'update') {
          await trx
            .updateTable('pds_record')
            .set({ cid, content: record!, indexed_at: now })
            .where('uri', '=', uri)
            .execute();
        } else {
          await trx
            .updateTable('pds_record')
            .set({ deleted_at: now })
            .where('uri', '=', uri)
            .execute();
        }

        // pds_commit may not exist after V3 cleanup migration (056) — skip gracefully.
        // Use a SAVEPOINT to isolate a potential "relation does not exist" error
        // so the outer transaction is not aborted.
        let globalSeq: number = Date.now();
        try {
          await sql`SAVEPOINT pds_commit_insert`.execute(trx);
          const insertResult = await sql<{ global_seq: number }>`
            INSERT INTO pds_commit
              (local_seq, did, commit_cid, record_uri, record_cid, operation, prev_record_cid, committed_at)
            VALUES
              (${localSeq}, ${did}, ${commitCid}, ${uri as string}, ${cid as string}, ${operation}, ${prevCid ?? null}, ${now})
            RETURNING global_seq
          `.execute(trx);
          await sql`RELEASE SAVEPOINT pds_commit_insert`.execute(trx);
          const firstRow = insertResult.rows[0];
          if (firstRow) globalSeq = firstRow.global_seq;
        } catch (commitErr: unknown) {
          await sql`ROLLBACK TO SAVEPOINT pds_commit_insert`.execute(trx).catch(() => {});
          const commitMsg = commitErr instanceof Error ? commitErr.message : '';
          if (!commitMsg.includes('relation') || !commitMsg.includes('does not exist')) {
            throw commitErr; // Re-throw unexpected errors
          }
          // pds_commit table does not exist — use timestamp as fallback seq
        }

        const event: FirehoseEvent = {
          seq: globalSeq,
          did: did as DID,
          operation,
          uri,
          cid,
          ...(record ? { record } : {}),
          ...(prevCid ? { prevCid: prevCid as CID } : {}),
          time: now.toISOString(),
        };

        await sql`SELECT pg_notify('pds_firehose', ${JSON.stringify(event)})`.execute(
          trx,
        );
      });
    } catch (err: unknown) {
      // Retry on (did, local_seq) unique constraint violation — two concurrent
      // writers can race to compute the same next localSeq inside their
      // respective transactions. The unique constraint catches this; retry
      // so the loser re-computes with the winner's value now committed.
      const pg = err as Record<string, unknown>;
      if (
        _retries > 0 &&
        pg?.code === '23505' &&
        typeof pg?.constraint === 'string' &&
        pg.constraint.includes('local_seq')
      ) {
        return this._writeCommit(did, uri, cid, record, operation, prevCid, _retries - 1);
      }
      throw err;
    }
  }
}
