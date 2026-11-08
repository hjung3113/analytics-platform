import { sql, type SQL } from 'drizzle-orm';
import type { MenuActionDeclaration } from '../menu-dispatch/types.js';
import { viewerOf } from '../log-knowledge/index.js';
import { attemptVisibleSql, projectVisibleSql, requestVisibleSql, roundVisibleSql } from './repositories/access-visibility.js';

export function withLifecycleReplayAccess(declaration: MenuActionDeclaration): MenuActionDeclaration {
  return { ...declaration, async canReplay(tx, actor, input, saved) {
    const viewer = viewerOf(actor);
    const op = declaration.spec.id.slice('logLifecycle.'.length);
    const checks: SQL[] = [];
    for (const value of [input, saved.data]) {
      if (!value || typeof value !== 'object') continue;
      for (const [key, id] of Object.entries(value)) {
        if (typeof id !== 'string') continue;
        const ref = sql`${id}::uuid`;
        if (key === 'projectId' || (key === 'id' && op.startsWith('project'))) checks.push(projectVisibleSql(viewer, ref));
        if (key === 'roundId' || (key === 'id' && (op.startsWith('round') || (op === 'excerptDelete' && input.scope === 'round')))) checks.push(roundVisibleSql(viewer, ref));
        if (key === 'id' && op === 'excerptDelete' && input.scope === 'attempt') checks.push(attemptVisibleSql(viewer, ref));
        if (key === 'requestId' || (key === 'id' && op.startsWith('request'))) checks.push(requestVisibleSql(viewer, ref));
      }
    }
    for (const check of checks) {
      const result = await tx.execute(sql`select ${check} as visible`);
      if (result.rows[0]?.visible !== true) return false;
    }
    return true;
  } };
}
