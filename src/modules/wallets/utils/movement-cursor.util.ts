export type MovementCursor = {
  createdAt: Date;
  id: string;
};

export function encodeMovementCursor(cursor: MovementCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

export function decodeMovementCursor(raw: string): MovementCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as { createdAt: string; id: string };
    if (!parsed.createdAt || !parsed.id) {
      return null;
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}
