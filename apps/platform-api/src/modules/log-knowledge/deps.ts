import type { Db } from '../../db/client.js';
import type { CheckService } from '../permissions/check-service.js';

export interface LogKnowledgeDeps {
  db: Db;
  checkService: CheckService;
}
