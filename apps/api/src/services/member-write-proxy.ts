import type { DID, AtUri, CID } from '@coopsource/common';
import type { IPdsService, RecordRef } from '@coopsource/federation';
import type { NodeOAuthClient } from '@atproto/oauth-client-node';
import { Agent } from '@atproto/api';

export interface IMemberRecordWriter {
  writeRecord(params: {
    memberDid: DID;
    collection: string;
    record: Record<string, unknown>;
    rkey?: string;
  }): Promise<RecordRef>;

  updateRecord(params: {
    memberDid: DID;
    collection: string;
    rkey: string;
    record: Record<string, unknown>;
  }): Promise<RecordRef>;
}

/**
 * Proxies member-owned record writes to the member's own PDS via OAuth.
 *
 * In development/test: falls back to cooperative PDS with a warning when
 * no OAuth session is available.
 *
 * In production: throws an error if no OAuth session exists — member-owned
 * records MUST be written to the member's PDS, never silently to the
 * cooperative's PDS.
 */
export class MemberWriteProxy implements IMemberRecordWriter {
  private isProduction: boolean;

  constructor(
    private oauthClient: NodeOAuthClient | undefined,
    private pdsService: IPdsService,
    nodeEnv: string,
  ) {
    this.isProduction = nodeEnv === 'production';
  }

  async writeRecord(params: {
    memberDid: DID;
    collection: string;
    record: Record<string, unknown>;
    rkey?: string;
  }): Promise<RecordRef> {
    if (!this.oauthClient) {
      return this.handleNoOAuth(params, 'No OAuth client configured');
    }

    // Step 1: Restore the OAuth session. If this fails, it's a session
    // issue (no stored session), handled per environment.
    let session;
    try {
      session = await this.oauthClient.restore(params.memberDid);
    } catch (err) {
      return this.handleNoOAuth(params, `No OAuth session for ${params.memberDid}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 2: Verify the session DID matches the requested member DID.
    if (session.did && session.did !== params.memberDid) {
      throw new Error(
        `OAuth session DID mismatch: session has ${session.did} but write requested for ${params.memberDid}`,
      );
    }

    // Step 3: Write via the Agent (XRPC). Errors here are always propagated
    // — they represent real PDS/network failures, not session issues.
    const agent = new Agent(session.fetchHandler.bind(session));

    const result = await agent.com.atproto.repo.createRecord({
      repo: params.memberDid,
      collection: params.collection,
      rkey: params.rkey,
      record: {
        $type: params.collection,
        ...params.record,
      },
    });

    return {
      uri: result.data.uri as AtUri,
      cid: result.data.cid as CID,
    };
  }

  async updateRecord(params: {
    memberDid: DID;
    collection: string;
    rkey: string;
    record: Record<string, unknown>;
  }): Promise<RecordRef> {
    if (!this.oauthClient) {
      return this.handleNoOAuthUpdate(params, 'No OAuth client configured');
    }

    let session;
    try {
      session = await this.oauthClient.restore(params.memberDid);
    } catch (err) {
      return this.handleNoOAuthUpdate(params, `No OAuth session for ${params.memberDid}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (session.did && session.did !== params.memberDid) {
      throw new Error(
        `OAuth session DID mismatch: session has ${session.did} but write requested for ${params.memberDid}`,
      );
    }

    const agent = new Agent(session.fetchHandler.bind(session));

    const result = await agent.com.atproto.repo.putRecord({
      repo: params.memberDid,
      collection: params.collection,
      rkey: params.rkey,
      record: {
        $type: params.collection,
        ...params.record,
      },
    });

    return {
      uri: result.data.uri as AtUri,
      cid: result.data.cid as CID,
    };
  }

  private handleNoOAuthUpdate(
    params: {
      memberDid: DID;
      collection: string;
      rkey: string;
      record: Record<string, unknown>;
    },
    reason: string,
  ): Promise<RecordRef> {
    if (this.isProduction) {
      throw new Error(
        `Cannot update member-owned record in production: ${reason}. ` +
        `Member ${params.memberDid} must have an OAuth session to update ${params.collection} in their PDS.`,
      );
    }

    console.warn(
      `[MemberWriteProxy] ${reason} — falling back to cooperative PDS (dev mode). ` +
      `Collection: ${params.collection}, Member: ${params.memberDid}`,
    );

    return this.pdsService.putRecord({
      did: params.memberDid,
      collection: params.collection,
      rkey: params.rkey,
      record: params.record,
    });
  }

  private handleNoOAuth(
    params: {
      memberDid: DID;
      collection: string;
      record: Record<string, unknown>;
      rkey?: string;
    },
    reason: string,
  ): Promise<RecordRef> {
    if (this.isProduction) {
      throw new Error(
        `Cannot write member-owned record in production: ${reason}. ` +
        `Member ${params.memberDid} must have an OAuth session to write ${params.collection} to their PDS.`,
      );
    }

    console.warn(
      `[MemberWriteProxy] ${reason} — falling back to cooperative PDS (dev mode). ` +
      `Collection: ${params.collection}, Member: ${params.memberDid}`,
    );

    return this.pdsService.createRecord({
      did: params.memberDid,
      collection: params.collection,
      record: params.record,
      rkey: params.rkey,
    });
  }
}
