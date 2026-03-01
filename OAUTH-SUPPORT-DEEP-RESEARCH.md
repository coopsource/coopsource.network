# Node.js OAuth/OIDC provider libraries for an ATProto-compatible cooperative platform

**Only two options support the full ATProto OAuth profile out of the box: `node-oidc-provider` and Keycloak.** Every other Node.js library—oauth2orize, @node-oauth/oauth2-server, @jmondi/oauth2-server, Better Auth—lacks DPoP and PAR support, both mandatory for ATProto. The practical choice comes down to wrapping `node-oidc-provider` with custom extensions versus accepting Keycloak's operational weight, with a custom build as a deliberate long-term alternative if neither fits. The ATProto OAuth profile is unusually demanding: it requires **OAuth 2.0 (not OIDC)**, mandatory DPoP with server-issued nonces, mandatory PAR, PKCE S256, and a novel client metadata document pattern that no library implements natively.

## What ATProto actually demands from an authorization server

ATProto's OAuth profile diverges significantly from standard OIDC. It uses **OAuth 2.1 (not OpenID Connect)**—the spec explicitly states OIDC is "not compatible" because it requires pre-established client relationships. Authentication happens through a mandatory `sub` field containing the account's DID in token responses, plus bidirectional identity verification, replacing OIDC's ID token flow.

The technical requirements are strict. **PKCE with S256** is mandatory for all clients—`plain` is forbidden. **DPoP (RFC 9449) with mandatory server-issued nonces** is required for both token requests and resource access; nonce lifetime is capped at **5 minutes**, and ES256 is the only allowed signing algorithm. **PAR (RFC 9126)** is mandatory—the server must set `require_pushed_authorization_requests: true` in its metadata. Traditional dynamic client registration (RFC 7591) is replaced by the **Client ID Metadata Document** draft, where the `client_id` is an HTTPS URL pointing to a JSON metadata document the server fetches dynamically. Confidential clients authenticate via **`private_key_jwt`** (JWT client assertions signed with ES256), not client secrets.

Required endpoints include `/.well-known/oauth-authorization-server` (not the OIDC discovery path), a PAR endpoint, authorization and token endpoints, and optionally `/.well-known/oauth-protected-resource` for the resource server. The server must implement a **hardened HTTP client** for fetching client metadata (SSRF protection) and support **CORS** on relevant endpoints.

Critically, **no one outside Bluesky has built an ATProto-compatible OAuth provider**. The `@atproto/oauth-provider` npm package (v0.15.9, MIT license, actively published) exists but has no README, no documentation, and is tightly coupled to the Bluesky PDS monorepo. The Bluesky team has explicitly stated that supporting external OAuth providers for their PDS is "not on current priorities."

## node-oidc-provider is the strongest Node.js contender, with caveats

`node-oidc-provider` (panva) stands alone as the **only OpenID Certified Node.js OIDC/OAuth server library** with ~3,600 GitHub stars, ~190,000 weekly npm downloads, and active development (v9.6.1 released December 2025). It supports **DPoP, PAR, PKCE, dynamic client registration, FAPI 2.0, CIBA, JARM, mTLS, resource indicators**, and custom grant types—more protocol coverage than any alternative.

| Capability | Status | Notes |
|---|---|---|
| DPoP (RFC 9449) | ✅ Full | Includes nonce challenges, DPoP-bound tokens |
| PAR (RFC 9126) | ✅ Full | First-class adapter model |
| PKCE (RFC 7636) | ✅ Full | Configurable S256-only enforcement |
| Dynamic Client Registration | ✅ Full | RFC 7591/7592, custom ID factory |
| Custom token claims (DIDs) | ✅ Full | Via `extraTokenClaims` and `findAccount` hooks |
| Express 5 | ✅ Explicit | `provider.callback()` returns Express-compatible middleware |
| Custom grant types | ✅ Full | `provider.registerGrantType()` API |
| Node.js 24 LTS | ✅ | ESM-only, works with modern Node.js |

Three significant challenges remain. **Multi-tenancy** is the biggest: each `Provider` instance binds to a single issuer URL, so serving multiple cooperatives with custom domains requires spinning up multiple Provider instances and routing by hostname—feasible but architecturally non-trivial, with multiplied memory per tenant. **PostgreSQL/Kysely integration** requires writing a custom adapter (7 methods across 14 model types); no official adapter exists, and community feedback describes the process as frustrating due to opaque JSON payloads. The adapter interface stores payloads as generic JSON blobs, which maps well to PostgreSQL's `jsonb` but requires careful schema design. **TypeScript support** is indirect—the library is plain JavaScript with external `@types/oidc-provider` definitions from DefinitelyTyped, meaning no compile-time guarantees from the library itself and potential type gaps.

The maintainer, Filip Skokan, is a sole contributor but also an **IETF spec co-author** and Auth0/Okta affiliate—strong protocol expertise but a single point of failure for a security-critical dependency. Documentation is comprehensive but dense: a single massive README with all configuration options, no tutorials. Expect **2–4 weeks of integration work** for the adapter, interaction flows, and multi-tenant routing.

The most critical gap for ATProto specifically is the **Client ID Metadata Document** pattern. `node-oidc-provider` supports traditional dynamic client registration but not the ATProto-specific pattern where `client_id` is a URL and the server fetches metadata automatically. This would need to be implemented as custom middleware intercepting the PAR flow—doable but requires understanding both the library's internals and the ATProto draft spec.

## Every other Node.js library falls short on DPoP and PAR

The landscape of Node.js OAuth server libraries is surprisingly thin once you filter for ATProto's requirements:

| Library | TypeScript | DPoP | PAR | PKCE | OIDC | Maintained | Verdict |
|---|---|---|---|---|---|---|---|
| **oauth2orize** | ❌ @types only | ❌ | ❌ | ⚠️ stale plugin | ⚠️ stale plugin | ❌ Dormant since Apr 2024 | Legacy; not viable |
| **@node-oauth/oauth2-server** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ Active | Basic OAuth2 only |
| **@jmondi/oauth2-server** | ✅ Native | ❌ | ❌ | ✅ | ❌ | ✅ Active (v4.2.2) | Best TS-native, but missing critical features |
| **Better Auth provider plugin** | ✅ Native | ❌ | ❌ | ✅ | ✅ | ⚠️ "Not production-ready" | Interesting but immature |
| **Auth.js / NextAuth** | ✅ | — | — | — | — | ✅ | Client only; cannot be a provider |
| **Lucia Auth** | ✅ | — | — | — | — | ❌ Deprecated Mar 2025 | Session library; never a provider |

**`@jmondi/oauth2-server`** deserves mention as the cleanest TypeScript-native option (~299 stars, v4.2.2, Express/Fastify adapters, repository pattern that maps well to Kysely). It implements RFC 6749, PKCE, token revocation, introspection, and token exchange. But it lacks OIDC, DPoP, and PAR—you'd essentially be building those from scratch on top of it, which defeats the purpose of using a library.

**`oauth2orize`** is effectively dead: last commit April 2024, 75 open issues, and its extension ecosystem (PKCE, OpenID) is 6–8 years stale. **Better Auth**'s OAuth 2.1 provider plugin is the most promising newcomer (1.3M weekly downloads for the framework), but the provider functionality is explicitly marked as not production-ready and lacks DPoP/PAR.

## Keycloak is the only external solution that works, at a cost

Among external solutions, **Keycloak is the sole option supporting the full ATProto feature set**: DPoP (fully supported since v26.4), PAR, PKCE, dynamic client registration, and native multi-tenancy via realms—each realm an isolated tenant with its own issuer URL, users, clients, keys, and branding. Custom token claims for DIDs work through its powerful protocol mapper system. It's Apache 2.0 licensed, backed by Red Hat, and battle-tested with **~32,800 GitHub stars**.

The cost is operational weight: **~2 GB RAM minimum** per instance, Java/Quarkus runtime, 30–60 second startup times, and a steep learning curve. Extending it for `did:web` identity requires writing custom authenticator SPIs in Java—a significant departure from a TypeScript-focused team. However, its Admin REST API is comprehensive and fully programmable from Node.js via `@keycloak/keycloak-admin-client`, and each cooperative's realm can be created programmatically.

**Ory Hydra**, despite its elegant architecture (Go binary, ~50 MB RAM, consent-flow model perfect for custom auth), **lacks both DPoP and PAR**—confirmed through documentation and GitHub issues. This is a hard dealbreaker for ATProto. Multi-tenancy also requires separate instances per issuer (or enterprise licensing). **ZITADEL**, **Authentik**, **Authelia**, and **Dex** all similarly lack DPoP and PAR support, eliminating them from consideration.

## The custom build path is viable but expensive

Building from scratch using `jose` (panva's JWT library, ~6,000 stars, 16M weekly downloads, zero dependencies) as the cryptographic foundation is the most flexible option. The required building blocks exist:

- **`jose`** — JWT signing/verification, JWK/JWKS management, all algorithms including ES256
- **`@panva/hkdf`** — Key derivation (RFC 5869)
- **`oidc-token-hash`** — OIDC hash claim generation (`at_hash`, `c_hash`)
- **PKCE validation** — ~10 lines of code (SHA-256 comparison)
- **DPoP validation** — Custom on `jose` primitives (verify embedded JWK, thumbprint, claims)
- **PAR** — Relatively straightforward POST endpoint with standard OAuth parameters

A minimal ATProto-compatible OAuth server requires **10–11 endpoints** and an estimated **8,000–15,000 lines of TypeScript** (excluding tests). With tests (essential for security-critical code), expect 15,000–25,000 total lines. For two experienced developers, the timeline is roughly **3–4 months** for core OAuth + PKCE + DPoP + PAR, **6–9 months** for full OIDC + ATProto profile + multi-tenancy + capability-based permissions + `did:web` integration, plus 2–3 months for security audit and OpenID certification.

The `@atproto/oauth-provider` package from Bluesky is technically a fourth option: fork it and adapt it. It's production-tested at Bluesky scale and implements every ATProto-specific feature. But it has no documentation, no README, 28 dependencies, tight coupling to the ATProto monorepo, and isn't designed for general-purpose use or multi-tenancy. Forking it means inheriting Bluesky's architectural decisions and maintaining diverging code against an active upstream.

Security risks of building custom are substantial: timing attacks on token validation, CSRF vulnerabilities, key rotation mistakes, SSRF in client metadata fetching, DPoP replay attacks, and redirect URI validation failures. A professional security audit typically costs **$30,000–$100,000+**.

## Practical recommendation for a federated cooperative platform

The decision tree comes down to three viable paths, each with clear tradeoffs:

**Path 1: `node-oidc-provider` + custom extensions** (recommended for most teams). Use it as the OAuth/OIDC engine, write a PostgreSQL/Kysely adapter (~1 week), implement multi-tenant routing with a Provider instance factory (~1 week), and add custom middleware for ATProto's Client ID Metadata Document pattern (~1–2 weeks). Total integration: **4–8 weeks**. This gets you OpenID Certification, battle-tested protocol handling, and DPoP/PAR/PKCE for free. The TypeScript friction is real but manageable—wrap the library in typed service classes. The multi-tenancy approach (multiple Provider instances) works for a cooperative platform where tenant count is likely in the dozens to hundreds, not millions.

**Path 2: Keycloak sidecar** (recommended if multi-tenancy and operational simplicity outweigh resource constraints). Deploy Keycloak as a Docker container alongside your Node.js app, use realms for tenant isolation, and manage everything via the Admin REST API. Best if the team is comfortable with Java SPIs for `did:web` extensions and can allocate **2–4 GB RAM** for the Keycloak container. Gets you DPoP, PAR, PKCE, multi-tenancy, and a proven identity platform with minimal custom code.

**Path 3: Custom build on `jose`** (recommended only if ATProto compatibility is the primary concern and the team has deep OAuth expertise). Provides maximum control, native TypeScript, direct Kysely integration, and purpose-built architecture for `did:web` + capability-based permissions. But the **6–9 month timeline** and ongoing maintenance burden are significant. Consider this path if the platform's identity model is so unique that wrapping an existing library would mean fighting it more than using it.

## Conclusion

The ATProto OAuth profile's combination of mandatory DPoP with server nonces, PAR, and the Client ID Metadata Document pattern creates a surprisingly narrow field. **`node-oidc-provider` emerges as the pragmatic choice**—it's the only Node.js library that covers DPoP + PAR + PKCE + dynamic client registration, with Express 5 support and enough extensibility to implement ATProto's client metadata fetching and `did:web` identity. Its weaknesses (no native TypeScript, single maintainer, manual multi-tenancy) are manageable engineering challenges, not architectural dealbreakers. The custom build path makes sense only if the cooperative platform's federated identity model proves fundamentally incompatible with `node-oidc-provider`'s abstractions—something best discovered during a 2-week proof-of-concept rather than decided upfront.