import type { ApiResponse } from '@ap/contracts';

type HasResponse<T> = { response: ApiResponse<T> | null };

/** A read that has answered `ok` or `empty` (an unknown id); `error`, `forbidden` and a pending read are not settled. */
export const settled = <T,>(query: HasResponse<T>): boolean => query.response !== null && (query.response.outcome === 'ok' || query.response.outcome === 'empty');
/** The data of an `ok` answer; null while pending, empty or failed. */
export const dataOf = <T,>(query: HasResponse<T>): T | null => (query.response?.outcome === 'ok' ? query.response.data : null);

/** A hash the screen never sends: placeholder params of a disabled read. */
export const NO_REVISION = `sha256:${'0'.repeat(64)}`;

/** An answered empty list is distinct from a read still pending or failed. */
export const rowsOf = <T,>(query: HasResponse<{ rows: T[] }>): readonly T[] | null => dataOf(query)?.rows ?? (query.response?.outcome === 'empty' ? [] : null);
