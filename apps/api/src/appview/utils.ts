/**
 * Extract the collection name from an AT URI.
 * at://did/collection/rkey → collection
 */
export function collectionFromUri(uri: string): string {
  const withoutScheme = uri.replace('at://', '');
  const parts = withoutScheme.split('/');
  return parts[1] ?? '';
}
