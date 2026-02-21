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
        ? new LocalPlcClient(db)
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
    // Replay backlog first
    const backlog = await this.db
      .selectFrom('pds_commit')
      .where('global_seq', '>', cursor)
      .orderBy('global_seq', 'asc')
      .selectAll()
      .execute();

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
        const seqResult = await trx
          .selectFrom('pds_commit')
          .where('did', '=', did)
          .select((eb) => [eb.fn.max('local_seq').as('max_seq')])
          .executeTakeFirst();
        const localSeq = (Number(seqResult?.max_seq ?? 0) || 0) + 1;

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

        const [commit] = await trx
          .insertInto('pds_commit')
          .values({
            local_seq: localSeq,
            did,
            commit_cid: commitCid,
            record_uri: uri,
            record_cid: cid,
            operation,
            prev_record_cid: prevCid ?? null,
            committed_at: now,
          })
          .returning('global_seq')
          .execute();

        const event: FirehoseEvent = {
          seq: commit!.global_seq as number,
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
