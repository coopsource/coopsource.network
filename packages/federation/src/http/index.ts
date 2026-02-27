export { HttpFederationClient } from './http-federation-client.js';
export { DidWebResolver } from './did-web-resolver.js';
export type { DidWebResolverOptions } from './did-web-resolver.js';
export { SigningKeyResolver } from './signing-key-resolver.js';
export type { ResolvedSigningKey } from './signing-key-resolver.js';
export {
  signRequest,
  verifyRequest,
  createContentDigest,
  verifyContentDigest,
} from './signing.js';
