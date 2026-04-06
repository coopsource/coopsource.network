import { lexicons as lexiconsInstance } from '@coopsource/lexicons';
import { logger } from '../../../middleware/logger.js';
import type { HookRegistration } from '../types.js';
import { incrementValidationWarnings } from '../pipeline.js';

/**
 * Pre-storage hook that validates records against known lexicon schemas.
 *
 * - Skips delete events (no record to validate)
 * - Skips unknown NSIDs (not in lexiconsInstance — generic records pass through)
 * - **Fail-open**: logs warnings but always returns 'store'
 *   (records may be ahead of our schemas; we never reject data)
 */
export const lexiconValidatorHook: HookRegistration = {
  id: 'builtin:lexicon-validator',
  name: 'Lexicon schema validator',
  phase: 'pre-storage',
  source: 'builtin',
  collections: ['network.coopsource.*'],
  priority: 0,
  preHandler: async (ctx) => {
    // Don't validate deletes (no record content)
    if (ctx.operation === 'delete' || !ctx.record.content) {
      return { action: 'store' };
    }

    // Check if we have a schema for this collection
    try {
      // Lexicons.validate() throws for unknown NSIDs
      const result = lexiconsInstance.validate(ctx.collection, ctx.record.content);
      if (!result.success) {
        incrementValidationWarnings();
        logger.warn(
          { collection: ctx.collection, uri: ctx.record.uri, error: String(result.error) },
          'Lexicon validation failed (storing anyway)',
        );
      }
    } catch {
      // Unknown NSID or validation not available — skip silently
    }

    return { action: 'store' };
  },
};
