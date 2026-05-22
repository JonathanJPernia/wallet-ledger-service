import { createHash } from 'crypto';

export function buildRequestHash(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
