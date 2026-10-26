import type { ConformanceCheck } from '../../types';

/** Marks a check that only means something for a site-scoped destination type (`planPortChecks` skips them for a siteless sample). */
export type AtSite = (check: ConformanceCheck) => ConformanceCheck;
