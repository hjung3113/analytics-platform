// The URL-owned query of the reporter's 내 VOC list. The host (platform bridge, ADR-0071) owns where it lives.

import { REPORTER_FACING_STATUS_ALL } from '@/lib/copy/reporter-status-labels';
import type { ReporterFacingStatusEnum } from '@fops/shared';

export const MY_VOC_SORTS = [
  'created_at:desc',
  'created_at:asc',
  'reporter_facing_status:asc',
] as const;
export type MyVocSort = (typeof MY_VOC_SORTS)[number];
export const MY_VOC_DEFAULT_SORT: MyVocSort = 'created_at:desc';
export const MY_VOC_QUERY_MAX = 100;

export interface MyVocQuery {
  q: string;
  statuses: ReporterFacingStatusEnum[];
  sort: MyVocSort;
}

export { REPORTER_FACING_STATUS_ALL };
