import type { CID, DID } from '@coopsource/common';
import type { IPdsService } from '@coopsource/federation';
import { LEXICON_IDS, validateRecord, type OrgMemberConsent } from '@coopsource/lexicons';

export const MEMBER_CONSENT_COLLECTION = 'network.coopsource.org.memberConsent';

export interface PublicRepoRecord {
  readonly uri: string;
  readonly cid: CID;
  readonly record: Record<string, unknown>;
}

export interface PublicRepoRecordResolverPort {
  resolveRecord(uri: string): Promise<PublicRepoRecord>;
}

export class PdsPublicRepoRecordResolver implements PublicRepoRecordResolverPort {
  constructor(private readonly pdsService: IPdsService) {}

  async resolveRecord(uri: string): Promise<PublicRepoRecord> {
    const record = await this.pdsService.getRecord(uri);
    return {
      uri: record.uri,
      cid: record.cid,
      record: record.value,
    };
  }
}

export interface VerifyConsentEvidenceArgs {
  readonly expectedAuthorDid: DID;
  readonly cooperativeDid: DID;
  readonly consentRecordUri: string;
  readonly consentRecordCid: string;
  readonly allowedConsentTypes: ReadonlyArray<OrgMemberConsent['consentType']>;
}

export interface ConsentEvidenceVerificationResult {
  readonly ok: boolean;
  readonly uri: string;
  readonly cid?: CID;
  readonly record?: OrgMemberConsent;
  readonly reason?: string;
}

export interface ConsentEvidenceVerifierOptions {
  readonly now: () => Date;
  readonly maxFutureMs?: number;
  readonly maxPastMs?: number;
}

export class ConsentEvidenceVerifier {
  private readonly maxFutureMs: number;
  private readonly maxPastMs: number;

  constructor(
    private readonly resolver: PublicRepoRecordResolverPort,
    private readonly options: ConsentEvidenceVerifierOptions,
  ) {
    this.maxFutureMs = options.maxFutureMs ?? 10 * 60 * 1000;
    this.maxPastMs = options.maxPastMs ?? 366 * 24 * 60 * 60 * 1000;
  }

  async verify(args: VerifyConsentEvidenceArgs): Promise<ConsentEvidenceVerificationResult> {
    const parsedUri = parseAtUri(args.consentRecordUri);
    if (!parsedUri) {
      return this.reject(args.consentRecordUri, 'consentRecordUri must be a valid AT URI');
    }
    if (parsedUri.did !== args.expectedAuthorDid) {
      return this.reject(args.consentRecordUri, 'consentRecordUri authority DID does not match the expected author');
    }
    if (parsedUri.collection !== MEMBER_CONSENT_COLLECTION) {
      return this.reject(args.consentRecordUri, 'consentRecordUri must point to memberConsent');
    }

    let resolved: PublicRepoRecord;
    try {
      resolved = await this.resolver.resolveRecord(args.consentRecordUri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.reject(args.consentRecordUri, `consent evidence could not be resolved: ${message}`);
    }

    if (resolved.cid !== args.consentRecordCid) {
      return this.reject(args.consentRecordUri, 'consentRecordCid does not match the resolved record CID', resolved.cid);
    }

    let record: OrgMemberConsent;
    try {
      record = validateRecord(LEXICON_IDS.OrgMemberConsent, resolved.record) as OrgMemberConsent;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.reject(args.consentRecordUri, `consent record failed lexicon validation: ${message}`, resolved.cid);
    }

    if (record.cooperative !== args.cooperativeDid) {
      return this.reject(args.consentRecordUri, 'consent record cooperative does not match the requested cooperative', resolved.cid);
    }
    if (!args.allowedConsentTypes.includes(record.consentType)) {
      return this.reject(args.consentRecordUri, 'consent record consentType is not allowed for this flow', resolved.cid);
    }
    if (!this.createdAtIsPlausible(record.createdAt)) {
      return this.reject(args.consentRecordUri, 'consent record createdAt is outside the plausible clock window', resolved.cid);
    }

    return {
      ok: true,
      uri: args.consentRecordUri,
      cid: resolved.cid,
      record,
    };
  }

  private createdAtIsPlausible(value: string): boolean {
    const createdAt = new Date(value);
    if (Number.isNaN(createdAt.valueOf())) return false;
    const now = this.options.now().valueOf();
    const timestamp = createdAt.valueOf();
    return timestamp <= now + this.maxFutureMs && timestamp >= now - this.maxPastMs;
  }

  private reject(uri: string, reason: string, cid?: CID): ConsentEvidenceVerificationResult {
    return { ok: false, uri, cid, reason };
  }
}

function parseAtUri(uri: string): { readonly did: DID; readonly collection: string; readonly rkey: string } | null {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(uri);
  if (!match) return null;
  const [, did, collection, rkey] = match;
  if (!did || !collection || !rkey) return null;
  return { did: did as DID, collection, rkey };
}
