import { usePlatform } from '@ap/kernel';

/** Reads the current menu's declared `requiredCapability.id` for feature screens. */
export function useMenuCapability(): string | undefined {
  return usePlatform().route?.menu.requiredCapability?.id;
}
