import type { Db } from '../../db/client.js';
import type { KnowledgeLookup } from '../log-knowledge/index.js';
import type { CheckService } from '../permissions/check-service.js';

export interface LogLifecycleDeps {
  db: Db;
  checkService: CheckService;
  /** The log knowledge read port: model / software existence at write time and the spec pin of a round. */
  knowledgeLookup: KnowledgeLookup;
}
