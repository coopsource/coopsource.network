import * as dagCbor from '@ipld/dag-cbor';

/**
 * ATProto-compatible unsigned label object.
 * Matches com.atproto.label.defs#label without the sig field.
 */
export interface UnsignedLabel {
  ver: number;
  src: string;
  uri: string;
  cid?: string;
  val: string;
  neg: boolean;
  cts: string;
  exp?: string;
}

/**
 * Signs governance labels with a cooperative's secp256k1 key.
 *
 * Signing process (matches ATProto label signing and PLC operation signing):
 *   1. Encode the label WITHOUT `sig` to DAG-CBOR
 *   2. Sign the bytes with the keypair (ECDSA-SHA256, low-S form)
 *   3. Return raw 64-byte signature
 */
export class LabelSigner {
  private privateKeyHex: string;

  constructor(privateKeyHex: string) {
    this.privateKeyHex = privateKeyHex;
  }

  async sign(label: UnsignedLabel): Promise<Uint8Array> {
    const { Secp256k1Keypair } = await import('@atproto/crypto');

    const keyBytes = hexToBytes(this.privateKeyHex);
    const keypair = await Secp256k1Keypair.import(keyBytes);

    // Encode label (without sig) to DAG-CBOR
    const labelBytes = new Uint8Array(dagCbor.encode(label));

    // Sign (atproto/crypto handles low-S internally)
    return keypair.sign(labelBytes);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
