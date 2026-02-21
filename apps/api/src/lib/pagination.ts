export interface PageParams {
  limit?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  cursor?: string;
}

export function parsePagination(query: Record<string, unknown>): PageParams {
  return {
    limit: query.limit
      ? Math.min(parseInt(String(query.limit), 10), 200)
      : 50,
    cursor: query.cursor ? String(query.cursor) : undefined,
  };
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ t: createdAt.toISOString(), i: id }),
  ).toString('base64url');
}

export function decodeCursor(
  cursor: string,
): { t: string; i: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
    t: string;
    i: string;
  };
}
