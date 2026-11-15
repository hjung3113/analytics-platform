import { CONTEXT_FIELDS, SITE_BOUND_CONTEXT_KEYS, type GlobalContext } from '@ap/contracts';

/** GlobalContext fields a Scope change clears: the fields of the site-bound keys plus `membershipBasis` (not a ContextKey). One list for the Scope switch, `resolveLink` and the saved-view Scope rule (#2175). */
export const SITE_BOUND_FIELDS: readonly (keyof GlobalContext)[] = [...SITE_BOUND_CONTEXT_KEYS.flatMap(key => CONTEXT_FIELDS[key]), 'membershipBasis'];
