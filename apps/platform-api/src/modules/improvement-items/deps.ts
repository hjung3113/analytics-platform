import type { Db } from '../../db/client.js';
import type { CheckService } from '../permissions/check-service.js';

export interface ImprovementItemsDeps {
  db: Db;
  checkService: CheckService;
}
