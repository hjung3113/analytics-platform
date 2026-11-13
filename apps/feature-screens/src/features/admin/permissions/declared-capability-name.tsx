import { useDeclaredCapabilities } from '@/lib/api/declared-capabilities';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';

/**
 * ADR-0157 decision 9: a declared capability's display name from the server read (plain text), or its id until the read
 * is loaded. Mounted only for a declared-prefix name, so platform rows never issue the read.
 */
export function DeclaredCapabilityName({ id }: { id: string }) {
  const declared = useDeclaredCapabilities();
  return <span>{getCapabilityDisplayLabel(id, declared)}</span>;
}
