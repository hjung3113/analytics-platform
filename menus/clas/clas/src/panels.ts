import type { PanelDeclaration } from '@ap/contracts';
import { operationTimeEndpoint } from './endpoints';

export const operationTimePanel = {
  id: 'operationTime',
  title: { ko: '동작시간', en: 'Operation time' },
  grain: 'equipment',
  endpoints: [operationTimeEndpoint],
  queryInputs: { context: ['scopeId', 'time', 'roomNames'], page: [{ key: 'eqp' }, { key: 'days', selection: 'filter' }] },
  displayInputs: {},
  outputs: [],
} as const satisfies PanelDeclaration;
