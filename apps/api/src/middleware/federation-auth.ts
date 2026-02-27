import type { RequestHandler } from 'express';
import type { DidWebResolver } from '@coopsource/federation/http';
import { verifyRequest } from '@coopsource/federation/http';

/**
 * Middleware that verifies HTTP Message Signatures on federation endpoints.
 *
 * If the request has a local user session (req.session?.did), signature
 * verification is skipped — this is a local user, not a server-to-server call.
 *
 * On success, sets req.federationSender to the verified signer's DID.
 * On failure, returns 401.
 */
export function requireFederationAuth(
  didResolver: DidWebResolver,
): RequestHandler {
  return async (req, res, next) => {
    // Skip if local user session exists
    if ((req.session as { did?: string } | undefined)?.did) {
      return next();
    }

    const method = req.method;
    const targetUri = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Build headers map
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers[key.toLowerCase()] = value;
      }
    }

    // Re-serialize body for digest verification
    // Deterministic because both sides use JSON.stringify
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
        res.status(401).json({
          error: 'InvalidSignature',
          message: 'HTTP signature verification failed',
        });
        return;
      }

      (req as unknown as Record<string, unknown>).federationSender = result.signerDid;
      next();
    } catch (err) {
      res.status(401).json({
        error: 'SignatureError',
        message:
          err instanceof Error
            ? err.message
            : 'Signature verification error',
      });
    }
  };
}
