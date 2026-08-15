/**
 * Cursor pagination helpers.
 *
 * Offset pagination drifts when rows are inserted while a user is paging — which
 * is the normal case for an activity feed or a notification list in a realtime
 * app. Cursors are opaque base64url of `createdAt|id`, which keeps them stable and
 * makes the "same timestamp" tie-break deterministic.
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const [timestamp, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!timestamp || !id) return null;
    const createdAt = new Date(timestamp);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Builds the `where` fragment for "strictly older than the cursor", ordered by
 * `createdAt DESC, id DESC`.
 */
export function cursorFilter(cursor: DecodedCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Trims an over-fetched page (limit + 1) down to size and derives the next cursor.
 */
export function toCursorPage<T extends { id: string; createdAt: Date }, R>(
  rows: T[],
  limit: number,
  map: (row: T) => R,
): CursorPage<R> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(map),
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
