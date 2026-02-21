/**
 * Runtime validator for Co-op Source Network ATProto lexicons.
 *
 * Uses @atproto/lexicon's Lexicons class to validate records against
 * the compiled lexicon schemas at runtime.
 */

import { Lexicons, type LexiconDoc } from '@atproto/lexicon';
import { lexicons as lexiconDefs } from './generated/lexicons.js';
import type { LexiconId, LexiconRecordMap } from './generated/types.js';

/** Singleton Lexicons instance loaded with all Co-op Source Network schemas. */
const lexiconsInstance = new Lexicons(lexiconDefs as unknown as LexiconDoc[]);

/**
 * Validate a record against its lexicon schema.
 *
 * @param collection - The lexicon NSID (e.g. 'network.coopsource.org.cooperative')
 * @param record - The record data to validate
 * @returns The validated (and possibly coerced) record
 * @throws {LexiconValidationError} if the record does not match the schema
 */
export function validateRecord<T extends LexiconId>(
  collection: T,
  record: unknown,
): LexiconRecordMap[T] {
  const result = lexiconsInstance.validate(collection, record);
  if (!result.success) {
    throw new LexiconValidationError(collection, result.error);
  }
  return result.value as LexiconRecordMap[T];
}

/**
 * Check if a record is valid without throwing.
 *
 * @param collection - The lexicon NSID
 * @param record - The record data to validate
 * @returns true if valid, false otherwise
 */
export function isValidRecord(collection: LexiconId, record: unknown): boolean {
  try {
    const result = lexiconsInstance.validate(collection, record);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Error thrown when a record fails lexicon validation.
 */
export class LexiconValidationError extends Error {
  public readonly collection: string;
  public readonly validationError: unknown;

  constructor(collection: string, validationError: unknown) {
    const message = validationError instanceof Error
      ? validationError.message
      : String(validationError);
    super(`Invalid record for ${collection}: ${message}`);
    this.name = 'LexiconValidationError';
    this.collection = collection;
    this.validationError = validationError;
  }
}

/** Expose the loaded Lexicons instance for advanced usage. */
export { lexiconsInstance as lexicons };
