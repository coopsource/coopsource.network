import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalBlobStore } from '../src/local/local-blob-store.js';

describe('LocalBlobStore', () => {
  let store: LocalBlobStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-test-'));
    store = new LocalBlobStore({ blobDir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uploads and retrieves a blob', async () => {
    const data = Buffer.from('hello world');
    const ref = await store.upload(data, 'text/plain');
    expect(ref.$type).toBe('blob');
    expect(ref.mimeType).toBe('text/plain');
    expect(ref.size).toBe(11);

    const retrieved = await store.get(ref.ref.$link);
    expect(retrieved.data.toString()).toBe('hello world');
  });

  it('deduplicates identical content', async () => {
    const data = Buffer.from('same content');
    const ref1 = await store.upload(data, 'text/plain');
    const ref2 = await store.upload(data, 'text/plain');
    expect(ref1.ref.$link).toBe(ref2.ref.$link);
  });

  it('has() returns false for unknown CID', async () => {
    expect(await store.has('unknown-cid')).toBe(false);
  });

  it('delete() removes blob', async () => {
    const data = Buffer.from('to delete');
    const ref = await store.upload(data, 'text/plain');
    await store.delete(ref.ref.$link);
    expect(await store.has(ref.ref.$link)).toBe(false);
  });

  it('throws NotFoundError for missing blob', async () => {
    await expect(store.get('nonexistent-cid')).rejects.toThrow(
      'Blob not found',
    );
  });
});
