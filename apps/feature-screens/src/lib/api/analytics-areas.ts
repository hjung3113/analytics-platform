// Analytics Areas registry (Slice 2 #11).
// The list read lives in ./registry-reads (bridge-safe, platform ADR-0071) and is re-exported here.

export { type AnalyticsAreaDto, fetchAnalyticsAreas } from './registry-reads';
export type { RegisterAnalyticsAreaBody, UpdateAnalyticsAreaBody } from './registry-writes';
export {
  archiveAnalyticsArea,
  registerAnalyticsArea,
  updateAnalyticsArea,
} from './registry-writes';
