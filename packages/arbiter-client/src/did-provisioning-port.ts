import type { DID } from '@coopsource/common';

export const SPACE_HOST_SERVICE_ID = '#space_host';
export const SPACE_HOST_SERVICE_TYPE = 'CoopSourceSpaceHost';

export interface DidServiceEntry {
  readonly id: string;
  readonly type: string;
  readonly serviceEndpoint: string;
}

export interface DidDocumentWithServices {
  readonly id: DID;
  readonly service?: ReadonlyArray<DidServiceEntry>;
}

export interface DidDocumentServiceBinding {
  resolveDid(did: DID): Promise<DidDocumentWithServices>;
  updateDidDocument(
    did: DID,
    updates: { readonly services?: ReadonlyArray<DidServiceEntry> },
  ): Promise<DidDocumentWithServices>;
}

export interface BindSpaceHostArgs {
  readonly did: DID;
  readonly serviceEndpoint: string;
  readonly actorDid: DID;
  readonly reason?: string;
}

export interface DidProvisioningResult {
  readonly ok: boolean;
  readonly did: DID;
  readonly service: DidServiceEntry;
  readonly changed: boolean;
}

export interface DidProvisioningPort {
  bindSpaceHost(args: BindSpaceHostArgs): Promise<DidProvisioningResult>;
}

export class PdsDidProvisioningPort implements DidProvisioningPort {
  constructor(private readonly didDocumentService: DidDocumentServiceBinding) {}

  async bindSpaceHost(args: BindSpaceHostArgs): Promise<DidProvisioningResult> {
    const current = await this.didDocumentService.resolveDid(args.did);
    const service: DidServiceEntry = {
      id: SPACE_HOST_SERVICE_ID,
      type: SPACE_HOST_SERVICE_TYPE,
      serviceEndpoint: args.serviceEndpoint,
    };
    const existing = current.service?.find((entry) => entry.id === SPACE_HOST_SERVICE_ID);
    if (
      existing?.type === service.type &&
      existing.serviceEndpoint === service.serviceEndpoint
    ) {
      return { ok: true, did: args.did, service, changed: false };
    }

    const services = [
      ...(current.service ?? []).filter((entry) => entry.id !== SPACE_HOST_SERVICE_ID),
      service,
    ];
    const updated = await this.didDocumentService.updateDidDocument(args.did, { services });
    const bound = updated.service?.find((entry) => entry.id === SPACE_HOST_SERVICE_ID);
    return {
      ok: bound?.type === service.type && bound.serviceEndpoint === service.serviceEndpoint,
      did: args.did,
      service,
      changed: true,
    };
  }
}
