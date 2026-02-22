/**
 * Decodes ATProto firehose wire format (CBOR frames containing CAR files).
 *
 * The firehose sends binary frames where each frame is two concatenated
 * CBOR values: a header and a body. Commit messages contain CAR files
 * with the actual records encoded as DAG-CBOR.
 */
import { decode as cborDecode, decodeFirst as cborDecodeFirst } from 'cborg';
import * as dagCbor from '@ipld/dag-cbor';
import { CarReader } from '@ipld/car';
import type { FirehoseEvent, FirehoseOperation } from '../types.js';
import type { AtUri, CID, DID } from '@coopsource/common';

interface FrameHeader {
  op: number; // 1 = regular message, -1 = error
  t?: string; // message type, e.g. '#commit', '#handle', '#identity'
}

interface CommitBody {
  seq: number;
  repo: string; // DID
  commit: unknown; // CID link
  rev: string;
  since: string | null;
  blocks: Uint8Array; // CAR file bytes
  ops: CommitOp[];
  time: string;
  tooBig: boolean;
}

interface CommitOp {
  action: 'create' | 'update' | 'delete';
  path: string; // collection/rkey
  cid: { '/': string } | null; // CID link (null for deletes)
}

/**
 * Decode a single firehose WebSocket message into FirehoseEvents.
 * Each message is two concatenated CBOR values: header + body.
 */
export function decodeFirehoseMessage(data: Uint8Array): FirehoseEvent[] {
  // Use cborg.decodeFirst to parse the header and get remaining bytes
  const [header, remainder] = cborDecodeFirst(data) as [FrameHeader, Uint8Array];

  if (header.op === -1) {
    return [];
  }

  if (header.t !== '#commit') {
    return [];
  }

  // Decode the body from the remaining bytes
  const body = cborDecode(remainder) as CommitBody;

  return decodeCommit(body);
}

function decodeCommit(body: CommitBody): FirehoseEvent[] {
  const events: FirehoseEvent[] = [];

  for (const op of body.ops) {
    const [collection, rkey] = op.path.split('/');
    if (!collection || !rkey) continue;

    const uri = `at://${body.repo}/${collection}/${rkey}` as AtUri;
    const cidStr = op.cid ? cidLinkToString(op.cid) : '';

    const operation: FirehoseOperation =
      op.action === 'create'
        ? 'create'
        : op.action === 'update'
          ? 'update'
          : 'delete';

    events.push({
      seq: body.seq,
      did: body.repo as DID,
      operation,
      uri,
      cid: cidStr as CID,
      record: undefined,
      time: body.time,
    });
  }

  return events;
}

/**
 * Decode a firehose message and resolve record contents from CAR blocks.
 * This is the async version that fully decodes record data.
 */
export async function decodeFirehoseMessageWithRecords(
  data: Uint8Array,
): Promise<FirehoseEvent[]> {
  const [header, remainder] = cborDecodeFirst(data) as [FrameHeader, Uint8Array];

  if (header.op === -1 || header.t !== '#commit') {
    return [];
  }

  const body = cborDecode(remainder) as CommitBody;

  // Decode CAR blocks to get actual record content
  const records = await readCarRecords(body.blocks);
  const events: FirehoseEvent[] = [];

  for (const op of body.ops) {
    const [collection, rkey] = op.path.split('/');
    if (!collection || !rkey) continue;

    const uri = `at://${body.repo}/${collection}/${rkey}` as AtUri;
    const cidStr = op.cid ? cidLinkToString(op.cid) : '';

    const operation: FirehoseOperation =
      op.action === 'create'
        ? 'create'
        : op.action === 'update'
          ? 'update'
          : 'delete';

    let record: Record<string, unknown> | undefined;
    if (op.cid && operation !== 'delete') {
      record = records.get(cidStr);
    }

    events.push({
      seq: body.seq,
      did: body.repo as DID,
      operation,
      uri,
      cid: cidStr as CID,
      record,
      time: body.time,
    });
  }

  return events;
}

async function readCarRecords(
  carBytes: Uint8Array,
): Promise<Map<string, Record<string, unknown>>> {
  const records = new Map<string, Record<string, unknown>>();
  if (!carBytes || carBytes.length === 0) return records;

  try {
    const reader = await CarReader.fromBytes(carBytes);
    for await (const block of reader.blocks()) {
      try {
        const record = dagCbor.decode<Record<string, unknown>>(block.bytes);
        records.set(block.cid.toString(), record);
      } catch {
        // Not all blocks are CBOR records (e.g. MST nodes)
      }
    }
  } catch {
    // CAR parsing can fail for various reasons
  }
  return records;
}

function cidLinkToString(link: { '/': string } | unknown): string {
  if (
    typeof link === 'object' &&
    link !== null &&
    '/' in link &&
    typeof (link as Record<string, unknown>)['/'] === 'string'
  ) {
    return (link as { '/': string })['/'];
  }
  return String(link);
}
