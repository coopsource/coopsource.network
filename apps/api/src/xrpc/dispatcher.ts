import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { lexicons } from '@coopsource/lexicons';
import { AppError } from '@coopsource/common';
import type { ServiceAuthVerifier, InlayAuthVerifier } from '@coopsource/federation/atproto';
import { requireViewer } from '../auth/middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { logger } from '../middleware/logger.js';
import type { Container } from '../container.js';

export interface XrpcQueryHandler {
  /** 'query' = GET (default), 'procedure' = POST (Inlay external components). */
  method?: 'query' | 'procedure';
  auth: 'none' | 'viewer' | 'optional' | 'inlay-viewer';
  rateLimit: { windowMs: number; limit: number };
  handler: (ctx: XrpcContext) => Promise<unknown>;
}

export interface XrpcContext {
  params: Record<string, unknown>;
  viewer?: { did: string; displayName: string };
  container: Container;
}

export interface XrpcRouteOptions {
  serviceAuthVerifier?: ServiceAuthVerifier;
  inlayAuthVerifier?: InlayAuthVerifier;
}

/**
 * Create Express router for XRPC query endpoints.
 * All registered handlers are served under `/xrpc/:methodId`.
 */
export function createXrpcRoutes(
  container: Container,
  handlers: Map<string, XrpcQueryHandler>,
  options?: XrpcRouteOptions,
): Router {
  const router = Router();

  // Build per-handler rate limiters at registration time
  const limiters = new Map<string, ReturnType<typeof rateLimit>>();
  for (const [methodId, handler] of handlers) {
    limiters.set(
      methodId,
      rateLimit({
        windowMs: handler.rateLimit.windowMs,
        limit: handler.rateLimit.limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: (req: Request) =>
          req.viewer?.did ?? req.ip ?? 'unknown',
        skip: () => process.env.NODE_ENV === 'test',
        validate: { keyGeneratorIpFallback: false },
        handler: (_req: Request, res: Response) => {
          res.status(429).json({
            error: 'RateLimitExceeded',
            message: 'Too many requests, please try again later.',
          });
        },
      }),
    );
  }

  // CORS preflight for cross-origin Inlay widgets
  router.options('/xrpc/:methodId', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).end();
  });

  // Primary GET handler for XRPC queries
  router.get(
    '/xrpc/:methodId',
    asyncHandler(async (req: Request, res: Response) => {
      setCorsHeaders(res);

      const methodId = String(req.params.methodId);
      const handler = handlers.get(methodId);
      if (!handler) {
        res.status(404).json({
          error: 'MethodNotFound',
          message: `Method not found: ${methodId}`,
        });
        return;
      }

      // Reject GET for procedure handlers (must use POST)
      if ((handler.method ?? 'query') === 'procedure') {
        res.status(405).json({
          error: 'InvalidMethod',
          message: `${methodId} is a procedure — use POST`,
        });
        return;
      }

      // Service-auth: try Bearer JWT from external ATProto apps before session auth.
      // If a valid Bearer token is present, set req.viewer from the JWT claims
      // and skip session-based auth entirely. Note: this sets req.viewer even
      // for auth:'none' handlers — those handlers simply ignore it.
      const serviceAuthResolved = await resolveServiceAuth(
        req, options?.serviceAuthVerifier, methodId,
      );

      if (!serviceAuthResolved) {
        // No service-auth token — fall through to session-based auth

        // Auth: run requireViewer if needed
        if (handler.auth === 'viewer') {
          await new Promise<void>((resolve, reject) => {
            requireViewer(req, res, (err?: unknown) =>
              err ? reject(err) : resolve(),
            );
          });
          if (res.headersSent) return;
        }

        // Optional auth: resolve viewer if session exists, but don't 401 on failure.
        // We cannot reuse requireViewer here because it sends a 401 response
        // directly (never calling next()), which would leave the Promise hanging.
        if (handler.auth === 'optional') {
          const did = req.session?.did;
          if (did) {
            const entity = await container.db
              .selectFrom('entity')
              .where('did', '=', did)
              .where('status', '=', 'active')
              .select(['did', 'display_name'])
              .executeTakeFirst();
            if (entity) {
              req.viewer = {
                did: entity.did,
                displayName: entity.display_name,
              };
            }
          }
        }
      }

      // Rate limiting
      const limiter = limiters.get(methodId);
      if (limiter) {
        await new Promise<void>((resolve, reject) => {
          limiter(req, res, (err?: unknown) =>
            err ? reject(err) : resolve(),
          );
        });
        if (res.headersSent) return;
      }

      // Parse and validate params against lexicon schema.
      // Skip validation for methods not in our lexicons (e.g. com.atproto.label.queryLabels).
      const params = parseQueryParams(req);
      if (lexicons.getDef(methodId)) {
        try {
          lexicons.assertValidXrpcParams(methodId, params);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Invalid parameters';
          res.status(400).json({ error: 'InvalidRequest', message });
          return;
        }
      }

      // Build context and call handler
      const ctx: XrpcContext = {
        params,
        viewer: req.viewer,
        container,
      };

      try {
        const output = await handler.handler(ctx);

        // Validate output against lexicon schema (skip for non-coopsource methods)
        if (lexicons.getDef(methodId)) {
          try {
            lexicons.assertValidXrpcOutput(methodId, output);
          } catch (err) {
            if (process.env.NODE_ENV === 'development') {
              throw err;
            }
            logger.warn(
              { methodId, err },
              'XRPC output validation failed — response returned anyway',
            );
          }
        }

        res.json(output);
      } catch (err) {
        if (err instanceof AppError) {
          res.status(err.statusCode).json({
            error: err.code,
            message: err.message,
          });
          return;
        }
        logger.error({ err, methodId }, 'XRPC handler error');
        res.status(500).json({
          error: 'InternalServerError',
          message: 'Internal server error',
        });
      }
    }),
  );

  // POST handler for XRPC procedures (Inlay external components)
  router.post(
    '/xrpc/:methodId',
    asyncHandler(async (req: Request, res: Response) => {
      setCorsHeaders(res);

      const methodId = String(req.params.methodId);
      const handler = handlers.get(methodId);
      if (!handler) {
        res.status(404).json({
          error: 'MethodNotFound',
          message: `Method not found: ${methodId}`,
        });
        return;
      }

      // Reject POST for query handlers (must use GET)
      if ((handler.method ?? 'query') === 'query') {
        res.status(405).json({
          error: 'InvalidMethod',
          message: `${methodId} is a query — use GET`,
        });
        return;
      }

      // Auth for Inlay procedures: verify viewer JWT via InlayAuthVerifier.
      // resolveInlayAuth returns false (no Bearer header) or true (verified).
      // Invalid JWTs throw AppError(401) caught by the error handler below.
      if (handler.auth === 'inlay-viewer') {
        if (!await resolveInlayAuth(req, options?.inlayAuthVerifier, methodId)) {
          throw new AppError(
            'Personalized component requires Authorization: Bearer <viewer-jwt>',
            401,
            'AuthenticationRequired',
          );
        }
      }

      // Rate limiting
      const limiter = limiters.get(methodId);
      if (limiter) {
        await new Promise<void>((resolve, reject) => {
          limiter(req, res, (err?: unknown) =>
            err ? reject(err) : resolve(),
          );
        });
        if (res.headersSent) return;
      }

      // Parse body as params (POST sends JSON body, not query params)
      const params = (req.body as Record<string, unknown>) ?? {};

      // Build context and call handler
      const ctx: XrpcContext = {
        params,
        viewer: req.viewer,
        container,
      };

      try {
        const output = await handler.handler(ctx);
        res.json(output);
      } catch (err) {
        if (err instanceof AppError) {
          res.status(err.statusCode).json({
            error: err.code,
            message: err.message,
          });
          return;
        }
        logger.error({ err, methodId }, 'XRPC procedure handler error');
        res.status(500).json({
          error: 'InternalServerError',
          message: 'Internal server error',
        });
      }
    }),
  );

  // Fallback for unsupported methods
  router.all('/xrpc/:methodId', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(405).json({
      error: 'InvalidMethod',
      message: 'XRPC endpoints accept GET (queries) or POST (procedures)',
    });
  });

  return router;
}

function setCorsHeaders(res: Response): void {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
}

/**
 * Attempt to resolve a service-auth Bearer JWT from the request.
 * Returns true if a valid JWT was found and req.viewer was set.
 * Returns false if no Bearer header is present (fall through to session auth).
 * Throws on invalid/expired/untrusted JWTs (the request should be rejected).
 */
async function resolveServiceAuth(
  req: Request,
  verifier: ServiceAuthVerifier | undefined,
  methodId: string,
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  if (!verifier) {
    // Service-auth is not configured — reject Bearer tokens rather than
    // silently ignoring them (could mask a misconfiguration).
    throw new AppError('Service authentication is not configured', 501, 'ServiceAuthNotConfigured');
  }

  const token = authHeader.slice(7);
  try {
    const result = await verifier.verify(token, methodId);
    req.viewer = {
      did: result.sub ?? result.iss,
      displayName: '',
    };
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service auth verification failed';
    logger.warn({ err, methodId }, 'Service-auth JWT rejected');
    throw new AppError(message, 401, 'AuthenticationRequired');
  }
}

/**
 * Verify an Inlay viewer JWT for personalized procedure handlers.
 * Returns true if a valid JWT was found and req.viewer was set.
 * Returns false if no Bearer header is present.
 * Throws on invalid JWTs.
 */
async function resolveInlayAuth(
  req: Request,
  verifier: InlayAuthVerifier | undefined,
  methodId: string,
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  if (!verifier) {
    throw new AppError('Inlay authentication is not configured', 501, 'InlayAuthNotConfigured');
  }

  const token = authHeader.slice(7);
  try {
    const result = await verifier.verify(token, methodId);
    req.viewer = {
      did: result.viewerDid,
      displayName: '',
    };
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Inlay auth verification failed';
    logger.warn({ err, methodId }, 'Inlay viewer JWT rejected');
    throw new AppError(message, 401, 'AuthenticationRequired');
  }
}

function parseQueryParams(req: Request): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    req.query as Record<string, string>,
  )) {
    if (value === undefined) continue;
    // Coerce known integer params
    if (key === 'limit') {
      params[key] = Number(value);
    } else {
      params[key] = value;
    }
  }
  return params;
}
