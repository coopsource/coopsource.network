import type { RequestHandler } from 'express';
import type { DidWebResolver } from '@coopsource/federation/http';
import { verifyRequest } from '@coopsource/federation/http';

/**
 * The one origin every inbound federation signature must have been made for.
 *
 * Derived once, at construction. `createFederationRoutes` runs while the app is
 * being built, so a `PUBLIC_API_URL` this cannot bind to is a startup failure,
 * never a per-request fallback — falling back to the request's own authority is
 * exactly the vulnerability (audit N-23), so there is deliberately no fallback
 * at all.
 *
 * `URL.origin` normalises what would otherwise be bypass variants: a trailing
 * slash, an explicit default port (`:443` on https), and host case. A scheme
 * with no origin (`file:`, `data:`) yields the literal string `'null'`; that is
 * rejected here rather than being allowed to become a target URI no signature
 * could ever match. `config.ts` refuses non-http(s) values and refuses to
 * resolve a fallback at all for a federating or production instance — but the
 * test harness builds an `AppConfig` by cast, bypassing Zod entirely, so this
 * check is what actually guarantees the invariant at the point of use.
 */
function federationSelfOrigin(publicApiUrl: string): string {
  let origin: string;
  try {
    origin = new URL(publicApiUrl).origin;
  } catch {
    throw new Error(
      'Federation auth cannot be configured: PUBLIC_API_URL is not a valid ' +
        `URL (${publicApiUrl}). Inbound signatures are verified against this ` +
        "instance's configured origin and have nothing to bind to.",
    );
  }
  if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
    throw new Error(
      'Federation auth cannot be configured: PUBLIC_API_URL has no http(s) ' +
        `origin (${publicApiUrl}).`,
    );
  }
  return origin;
}

/**
 * Middleware that verifies HTTP Message Signatures on federation endpoints.
 *
 * If the request has a local user session (req.session?.did), signature
 * verification is skipped — this is a local user, not a server-to-server call.
 * (That path is bound separately, by the caller-identity gates in
 * `routes/federation.ts`; audit C-04.)
 *
 * On success, sets req.federationSender to the verified signer's DID.
 * On failure, returns 401.
 */
export function requireFederationAuth(
  didResolver: DidWebResolver,
  publicApiUrl: string,
): RequestHandler {
  const selfOrigin = federationSelfOrigin(publicApiUrl);

  return async (req, res, next) => {
    // Skip if local user session exists
    if ((req.session as { did?: string } | undefined)?.did) {
      return next();
    }

    const method = req.method;
    // Audit N-23: the signed `@target-uri` is built from *this instance's*
    // configured origin, never from the request. Both halves of the authority
    // Express would report are attacker-supplied — `req.get('host')` is the raw
    // `Host` header, and `req.protocol` honours `X-Forwarded-Proto` once
    // `trust proxy` is on — so reconstructing the target from them let a
    // request legitimately signed for instance A replay against instance B by
    // sending `Host: <A>`, which made A-07's `@target-uri` coverage
    // requirement a no-op for cross-host replay. Binding to the configured
    // origin rather than asserting equality with the request's own also keeps
    // "how you dialled me" independent of "what you signed for", so a peer
    // reaching this instance over a private address still verifies as long as
    // it signed for the canonical origin. `req.originalUrl` (path + query) is
    // request-derived by design: that is the part the signature must cover.
    const targetUri = `${selfOrigin}${req.originalUrl}`;

    // Build headers map
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key.toLowerCase()] = value;
      }
    }

    // Re-serialize body for digest verification
    // Deterministic because both sides use JSON.stringify
    //
    // Known residual, deliberately untouched here (audit A-07, scoped to the
    // raw-body-capture work): this is a re-serialization, not the wire bytes.
    // Both directions of the gap live on this line. If `express.json()` did not
    // recognise the content-type, `req.body` is absent and this yields `null`,
    // so `verifyRequest`'s `if (body)` skips the digest requirement and real
    // wire bytes ride unbound — harmless only because every handler reads
    // `req.body` and Zod-400s on the empty object, and it becomes live the
    // moment any route reads the raw stream. Conversely a zero-length body with
    // `content-type: application/json` yields `{}` here, hence the string
    // `'{}'`, for which the signer would never have emitted a digest — that one
    // fails closed. Fixing either properly means capturing the raw body in a
    // `verify` callback on `express.json()`, which is out of this commit.
    const body = req.body ? JSON.stringify(req.body) : null;

    try {
      const result = await verifyRequest(
        method,
        targetUri,
        headers,
        body,
        didResolver,
      );

      if (!result.verified) {
        // The request's own view of the authority, used only to tell "signed
        // for a different instance" apart from "bad signature". It never feeds
        // verification.
        const dialedOrigin = `${req.protocol}://${req.get('host') ?? ''}`;
        res.status(401).json({
          error: 'InvalidSignature',
          axis: 'service-auth',
          message:
            dialedOrigin === selfOrigin
              ? 'HTTP signature verification failed'
              : 'HTTP signature verification failed: signatures are verified ' +
                `against this instance's configured origin (${selfOrigin}), ` +
                `not the requested authority (${dialedOrigin})`,
        });
        return;
      }

      (req as unknown as Record<string, unknown>).federationSender = result.signerDid;
      next();
    } catch (err) {
      res.status(401).json({
        error: 'SignatureError',
        axis: 'service-auth',
        message:
          err instanceof Error
            ? err.message
            : 'Signature verification error',
      });
    }
  };
}
