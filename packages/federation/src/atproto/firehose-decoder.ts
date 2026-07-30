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
import type {
  FirehoseEvent,
  FirehoseOperation,
  RepoAccountEvent,
  RepoIdentityEvent,
  RepositoryStreamEvent,
} from '../types.js';
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

interface IdentityBody {
  seq: number;
  did: string;
  time: string;
  handle?: string;
}

interface AccountBody {
  seq: number;
  did: string;
  time: string;
  active: boolean;
  status?: string;
}

/**
 * Decode a single firehose WebSocket message into FirehoseEvents.
 * Each message is two concatenated CBOR values: header + body.
 */
export function decodeFirehoseMessage(
  data: Uint8Array,
): RepositoryStreamEvent[] {
  // Use cborg.decodeFirst to parse the header and get remaining bytes
  const [header, remainder] = cborDecodeFirst(data) as [
    FrameHeader,
    Uint8Array,
  ];

  if (header.op === -1) {
    return [];
  }

  const body = cborDecode(remainder);
  if (header.t === '#identity') return [decodeIdentity(body)];
  if (header.t === '#account') return [decodeAccount(body)];
  if (header.t === '#commit') return decodeCommit(body as CommitBody);
  return [];
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
): Promise<RepositoryStreamEvent[]> {
  const [header, remainder] = cborDecodeFirst(data) as [
    FrameHeader,
    Uint8Array,
  ];

  if (header.op === -1) {
    return [];
  }

  const decodedBody = cborDecode(remainder);
  if (header.t === '#identity') return [decodeIdentity(decodedBody)];
  if (header.t === '#account') return [decodeAccount(decodedBody)];
  if (header.t !== '#commit') return [];
  const body = decodedBody as CommitBody;

  // Decode CAR blocks to get actual record content + commit signature
  const { records, commitSig, commitSignedBytes } =
    await readCarRecordsAndCommit(body.blocks, body.commit);
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
      commitSig,
      commitSignedBytes,
    });
  }

  return events;
}

function decodeIdentity(value: unknown): RepoIdentityEvent {
  const body = value as IdentityBody;
  requireLifecycleBase(body, '#identity');
  if (body.handle !== undefined && typeof body.handle !== 'string') {
    throw new Error('Invalid #identity handle');
  }
  return {
    kind: 'identity',
    seq: body.seq,
    did: body.did as DID,
    time: body.time,
    ...(body.handle !== undefined ? { handle: body.handle } : {}),
  };
}

function decodeAccount(value: unknown): RepoAccountEvent {
  const body = value as AccountBody;
  requireLifecycleBase(body, '#account');
  if (typeof body.active !== 'boolean') {
    throw new Error('Invalid #account active flag');
  }
  if (body.status !== undefined && typeof body.status !== 'string') {
    throw new Error('Invalid #account status');
  }
  return {
    kind: 'account',
    seq: body.seq,
    did: body.did as DID,
    time: body.time,
    active: body.active,
    ...(body.status !== undefined ? { status: body.status } : {}),
  };
}

function requireLifecycleBase(
  body: Partial<IdentityBody | AccountBody>,
  type: '#identity' | '#account',
): void {
  if (
    !Number.isSafeInteger(body.seq) ||
    typeof body.did !== 'string' ||
    !body.did.startsWith('did:') ||
    typeof body.time !== 'string'
  ) {
    throw new Error(`Invalid ${type} event`);
  }
}

interface CarDecodeResult {
  records: Map<string, Record<string, unknown>>;
  commitSig?: Uint8Array;
  commitSignedBytes?: Uint8Array;
}

async function readCarRecordsAndCommit(
  carBytes: Uint8Array,
  commitCid: unknown,
): Promise<CarDecodeResult> {
  const records = new Map<string, Record<string, unknown>>();
  const result: CarDecodeResult = { records };
  if (!carBytes || carBytes.length === 0) return result;

  const commitCidStr = cidLinkToString(commitCid);

  try {
    const reader = await CarReader.fromBytes(carBytes);
    for await (const block of reader.blocks()) {
      try {
        const decoded = dagCbor.decode<Record<string, unknown>>(block.bytes);
        records.set(block.cid.toString(), decoded);

        // Extract commit signature if this is the commit node
        if (
          block.cid.toString() === commitCidStr &&
          decoded.sig instanceof Uint8Array
        ) {
          result.commitSig = decoded.sig;
          // Re-encode without sig to get signedBytes
          const { sig: _sig, ...commitWithoutSig } = decoded;
          result.commitSignedBytes = dagCbor.encode(commitWithoutSig);
        }
      } catch {
        // Not all blocks are CBOR records (e.g. MST nodes)
      }
    }
  } catch {
    // CAR parsing can fail for various reasons
  }
  return result;
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
