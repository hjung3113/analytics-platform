// Registry-owned `external_key` families (#1289 node i, ADR-0110 decision 5). `platform` and `space:<space id>` are sync
// keys written only by the startup sync; every other key stays free metadata (migration 0086 holds the unique index).

export const PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY = 'platform';
export const SPACE_EXTERNAL_KEY_PREFIX = 'space:';

export function isRegistryOwnedKey(key: string | null | undefined): key is string {
  return (
    key !== null &&
    key !== undefined &&
    (key === PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY || key.startsWith(SPACE_EXTERNAL_KEY_PREFIX))
  );
}
