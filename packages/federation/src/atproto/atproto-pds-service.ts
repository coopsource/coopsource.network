import type { IPdsService } from '../interfaces/pds-service.js';

/**
 * Stage 2+: wraps @atproto/api to use a real ATProto PDS.
 * NOT IMPLEMENTED YET.
 */
export class AtprotoPdsService implements IPdsService {
  constructor(private _pdsUrl: string) {}

  createDid(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  resolveDid(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  updateDidDocument(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  createRecord(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  putRecord(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  deleteRecord(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  getRecord(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  listRecords(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
  subscribeRepos(): never {
    throw new Error('AtprotoPdsService not implemented');
  }
}
