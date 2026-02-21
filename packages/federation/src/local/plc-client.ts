export interface PlcCreateParams {
  signingKey: string; // multibase-encoded public key
  handle: string; // e.g. alice.acme.example.com
  pdsUrl: string; // e.g. https://acme.example.com
  rotationKeys?: string[];
}

/**
 * Client for interacting with a PLC directory (did-method-plc).
 * In development, this talks to a local PLC directory at localhost:2582.
 * In production, it talks to plc.directory.
 */
export class PlcClient {
  constructor(private plcUrl: string) {}

  /**
   * Create a new DID via a genesis operation.
   * POST / to the PLC directory with the signed genesis operation.
   * @returns The created DID string (e.g. "did:plc:abc123...")
   */
  async create(params: PlcCreateParams): Promise<string> {
    const rotationKeys = params.rotationKeys ?? [params.signingKey];

    const genesisOp = {
      type: 'plc_operation',
      rotationKeys,
      verificationMethods: {
        atproto: params.signingKey,
      },
      alsoKnownAs: [`at://${params.handle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: params.pdsUrl,
        },
      },
      prev: null,
    };

    const res = await fetch(`${this.plcUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genesisOp),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => 'unknown error');
      throw new Error(`PLC create failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { did: string };
    return data.did;
  }

  /**
   * Resolve a DID to its document.
   * GET /{did} from the PLC directory.
   */
  async resolve(did: string): Promise<object> {
    const res = await fetch(`${this.plcUrl}/${encodeURIComponent(did)}`);

    if (!res.ok) {
      throw new Error(`PLC resolve failed for ${did} (${res.status})`);
    }

    return (await res.json()) as object;
  }

  /**
   * Update a DID document (rotation, handle change, etc.).
   * POST /{did} with a signed operation.
   *
   * TODO: Implement proper operation signing with the rotation key.
   * For now, sends an unsigned update — suitable for local dev only.
   */
  async update(
    did: string,
    params: Partial<PlcCreateParams>,
    _signingPrivateKeyJwk: object,
  ): Promise<void> {
    const updateOp: Record<string, unknown> = {
      type: 'plc_operation',
    };

    if (params.signingKey) {
      updateOp.verificationMethods = { atproto: params.signingKey };
    }
    if (params.handle) {
      updateOp.alsoKnownAs = [`at://${params.handle}`];
    }
    if (params.pdsUrl) {
      updateOp.services = {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: params.pdsUrl,
        },
      };
    }
    if (params.rotationKeys) {
      updateOp.rotationKeys = params.rotationKeys;
    }

    // TODO: Sign the operation with _signingPrivateKeyJwk
    // For local dev, the PLC directory may accept unsigned updates

    const res = await fetch(
      `${this.plcUrl}/${encodeURIComponent(did)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateOp),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => 'unknown error');
      throw new Error(`PLC update failed for ${did} (${res.status}): ${body}`);
    }
  }
}
