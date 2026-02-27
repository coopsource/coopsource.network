import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import { urlToDidWeb } from '@coopsource/common';
import type { AppConfig } from '../config.js';

/**
 * GET /.well-known/did.json
 *
 * Serves the DID document for this instance's primary entity.
 * The DID is derived from INSTANCE_URL (or overridden by INSTANCE_DID).
 * The signing key is read from the entity_key table.
 */
export function createWellKnownRoutes(
  db: Kysely<Database>,
  config: AppConfig,
): Router {
  const router = Router();

  router.get('/.well-known/did.json', async (_req, res) => {
    try {
      const instanceDid = config.INSTANCE_DID ?? urlToDidWeb(config.INSTANCE_URL);

      // Look up the entity — in standalone mode this is the primary cooperative
      const entity = await db
        .selectFrom('entity')
        .where('did', '=', instanceDid)
        .where('invalidated_at', 'is', null)
        .select(['did', 'handle'])
        .executeTakeFirst();

      if (!entity) {
        // No entity matches the instance DID — return 404
        res.status(404).json({ error: 'DID not found' });
        return;
      }

      // Look up the active signing key
      const keyRow = await db
        .selectFrom('entity_key')
        .where('entity_did', '=', entity.did)
        .where('invalidated_at', 'is', null)
        .where('key_purpose', '=', 'signing')
        .select(['public_key_jwk'])
        .executeTakeFirst();

      // Build DID document per W3C DID Core + Multikey spec
      const didDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/multikey/v1',
        ],
        id: entity.did as DID,
        alsoKnownAs: entity.handle
          ? [`at://${entity.handle}`]
          : [],
        verificationMethod: keyRow
          ? [
              {
                id: `${entity.did}#signingKey`,
                type: 'JsonWebKey',
                controller: entity.did,
                publicKeyJwk: JSON.parse(keyRow.public_key_jwk),
              },
            ]
          : [],
        service: [
          {
            id: '#coopsource',
            type: 'CoopSourcePds',
            serviceEndpoint: config.INSTANCE_URL,
          },
        ],
      };

      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(didDocument);
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate DID document' });
    }
  });

  return router;
}
