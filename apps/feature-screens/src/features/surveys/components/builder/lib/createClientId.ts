import { randomUuidV4 } from '@/lib/api/idempotency';

let nextClientIdSequence = 0;

export function createClientId(prefix: string): string {
  nextClientIdSequence += 1;
  return `${prefix}${randomUuidV4()}-${nextClientIdSequence}`;
}
