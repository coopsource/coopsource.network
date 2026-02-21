import type { BlobRef } from '../types.js';

export interface BlobData {
  data: Buffer;
  mimeType: string;
  size: number;
}

export interface IBlobStore {
  upload(data: Buffer, mimeType: string): Promise<BlobRef>;
  get(cid: string): Promise<BlobData>;
  has(cid: string): Promise<boolean>;
  delete(cid: string): Promise<void>;
}
