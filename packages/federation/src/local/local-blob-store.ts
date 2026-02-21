import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { IBlobStore } from '../interfaces/blob-store.js';
import type { BlobData } from '../interfaces/blob-store.js';
import type { BlobRef } from '../types.js';
import { NotFoundError } from '@coopsource/common';

export interface LocalBlobStoreConfig {
  blobDir: string; // e.g. './data/blobs' — will be created if it doesn't exist
}

export class LocalBlobStore implements IBlobStore {
  constructor(private config: LocalBlobStoreConfig) {}

  private cidPath(cid: string): string {
    return path.join(this.config.blobDir, `${cid}.bin`);
  }

  private metaPath(cid: string): string {
    return path.join(this.config.blobDir, `${cid}.meta`);
  }

  async upload(data: Buffer, mimeType: string): Promise<BlobRef> {
    await fs.mkdir(this.config.blobDir, { recursive: true });

    // CID = sha256 hex of content, prefixed to indicate local blob
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const cid = `bafyblob${hash}`;

    if (!(await this.has(cid))) {
      await fs.writeFile(this.cidPath(cid), data);
      await fs.writeFile(
        this.metaPath(cid),
        JSON.stringify({ mimeType, size: data.length }),
      );
    }

    return {
      $type: 'blob',
      ref: { $link: cid },
      mimeType,
      size: data.length,
    };
  }

  async get(cid: string): Promise<BlobData> {
    try {
      const [data, meta] = await Promise.all([
        fs.readFile(this.cidPath(cid)),
        fs.readFile(this.metaPath(cid), 'utf-8').then(
          (s) => JSON.parse(s) as { mimeType: string; size: number },
        ),
      ]);
      return { data, mimeType: meta.mimeType, size: data.length };
    } catch {
      throw new NotFoundError(`Blob not found: ${cid}`);
    }
  }

  async has(cid: string): Promise<boolean> {
    try {
      await fs.access(this.cidPath(cid));
      return true;
    } catch {
      return false;
    }
  }

  async delete(cid: string): Promise<void> {
    await fs.unlink(this.cidPath(cid)).catch(() => {});
    await fs.unlink(this.metaPath(cid)).catch(() => {});
  }
}
