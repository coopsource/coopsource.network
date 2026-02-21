/** Branded type helper */
type Brand<T, B extends string> = T & { readonly __brand: B };

/** Decentralized Identifier (did:plc:... or did:web:...) */
export type DID = Brand<string, 'DID'>;

/** AT Protocol URI (at://did:plc:xxx/collection/rkey) */
export type AtUri = Brand<string, 'AtUri'>;

/** Content Identifier */
export type CID = Brand<string, 'CID'>;

/** Monetary value with currency */
export interface Money {
  amount: number;
  currency: string;
}
