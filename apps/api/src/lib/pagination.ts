export interface PageParams {
  limit?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  cursor?: string;
}

export function parsePagination(query: Record<string, unknown>): PageParams {
  const parsed = query.limit ? parseInt(String(query.limit), 10) : 50;
  return {
    limit: Number.isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 200),
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
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      t: string;
      i: string;
    };
  } catch {
    throw Object.assign(new Error('Invalid cursor'), { statusCode: 400 });
  }
}
