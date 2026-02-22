import { DidSchema, ValidationError } from '@coopsource/common';

export function validateDid(value: string | string[]): string {
  const did = String(value);
  const result = DidSchema.safeParse(did);
  if (!result.success) {
    throw new ValidationError('Invalid DID format');
  }
  return result.data;
}
