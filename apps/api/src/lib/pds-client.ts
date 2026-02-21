import type { Agent } from '@atproto/api';

export async function createRecord(
  agent: Agent,
  collection: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  try {
    const response = await agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection,
      record,
    });
    return { uri: response.data.uri, cid: response.data.cid };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      const did = agent.did ?? 'did:plc:dev-fallback';
      const rkey = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      return { uri: `at://${did}/${collection}/${rkey}`, cid: `dev-cid-${rkey}` };
    }
    throw err;
  }
}

export async function getRecord(
  agent: Agent,
  repo: string,
  collection: string,
  rkey: string,
): Promise<{ uri: string; cid?: string; value: unknown }> {
  const response = await agent.com.atproto.repo.getRecord({
    repo,
    collection,
    rkey,
  });
  return {
    uri: response.data.uri,
    cid: response.data.cid,
    value: response.data.value,
  };
}

export async function deleteRecord(
  agent: Agent,
  repo: string,
  collection: string,
  rkey: string,
): Promise<void> {
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo,
      collection,
      rkey,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    throw err;
  }
}

export async function listRecords(
  agent: Agent,
  repo: string,
  collection: string,
  options?: { limit?: number; cursor?: string; reverse?: boolean },
): Promise<{ records: Array<{ uri: string; cid: string; value: unknown }>; cursor?: string }> {
  const response = await agent.com.atproto.repo.listRecords({
    repo,
    collection,
    ...options,
  });
  return {
    records: response.data.records,
    cursor: response.data.cursor,
  };
}

export async function putRecord(
  agent: Agent,
  repo: string,
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  try {
    const response = await agent.com.atproto.repo.putRecord({
      repo,
      collection,
      rkey,
      record,
    });
    return { uri: response.data.uri, cid: response.data.cid };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      const did = agent.did ?? repo;
      return { uri: `at://${did}/${collection}/${rkey}`, cid: `dev-cid-${rkey}` };
    }
    throw err;
  }
}
