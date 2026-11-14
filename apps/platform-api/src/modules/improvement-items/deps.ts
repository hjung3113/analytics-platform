import type { Db } from '../../db/client.js';
import type { NotificationNotifier } from '../notifications/index.js';
import type { CheckService } from '../permissions/check-service.js';

import type { ScopeResolver } from '../menu-dispatch/index.js';

export interface ImprovementItemsDeps {
  scopeResolver?: ScopeResolver;
  db: Db;
  checkService: CheckService;
  notify: NotificationNotifier;
}
