import { parseSpaceRecordUri } from '@coopsource/spaces-consumer';

/**
 * Extract the collection name from an AT URI.
 * Plain public record: at://did/collection/rkey -> collection.
 * Permissioned record: at://spaceDid/space/spaceType/skey/authorDid/collection/rkey -> collection.
 */
export function collectionFromUri(uri: string): string {
  const spaceUri = parseSpaceRecordUri(uri);
  if (spaceUri) return spaceUri.collection;

  const withoutScheme = uri.replace('at://', '');
  const parts = withoutScheme.split('/');
  return parts[1] ?? '';
}
