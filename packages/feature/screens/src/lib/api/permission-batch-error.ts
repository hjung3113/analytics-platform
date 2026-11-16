import { ApiError } from './types';

/** Only an in-range, integral wire index may identify a submitted row. */
export function rejectedPermissionItem<T>(error: unknown, submitted: readonly T[]): T | undefined {
  const index = error instanceof ApiError ? error.detail?.item_index : undefined;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0
    ? submitted[index]
    : undefined;
}
