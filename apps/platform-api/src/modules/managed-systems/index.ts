export {
  createManagedSystemService,
  type ManagedSystemService,
  type ManagedSystemServiceDeps,
  type ManagedSystemDto,
  type RegisterManagedSystemBody,
  type UpdateManagedSystemBody,
  MS_SLUG_REGEX,
} from './managed-system-service.js';
export { managedSystemsRoutes, type ManagedSystemsRoutesOptions } from './routes.js';
export { lockManagedSystem, type LockedManagedSystem } from './repo.js';

export { recordResponsibilityDefaultFailure } from './default-diagnostics.js';
export { readManagedSystemState } from './repo.js';

export { readManagedSystemMetadata } from './report-metadata.js';
export {
  createPlatformSystemsSync,
  readPlatformSystemsFile,
  PLATFORM_SYSTEM_SLUG,
  PLATFORM_SYSTEM_NAME,
  type PlatformSystemsSync,
  type PlatformSystemsSyncResult,
} from './platform-systems-sync.js';
export { isRegistryOwnedKey, SPACE_EXTERNAL_KEY_PREFIX } from './registry-keys.js';
