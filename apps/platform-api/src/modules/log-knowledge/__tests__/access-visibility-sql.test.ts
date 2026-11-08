import { PgDialect } from 'drizzle-orm/pg-core';
import { alias } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { equipmentModels, knowledgeItems } from '../../../db/schema/knowledge.js';
import { ref, visibleItemSql, visibleModelSql, visibleSoftwareSql } from '../repositories/access-visibility.js';

const dialect = new PgDialect();
const viewer = { workspaceId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222' };
const render = (sql: Parameters<PgDialect['sqlToQuery']>[0]) => dialect.sqlToQuery(sql);

describe('visibility SQL', () => {
  it('ref() always qualifies the outer column, and an alias is written by its alias', () => {
    expect(render(ref(equipmentModels.id)).sql).toBe('"knowledge"."equipment_model"."id"');
    expect(render(ref(alias(equipmentModels, 'owner_md').id)).sql).toBe('"owner_md"."id"');
  });

  it.each([
    ['model', visibleModelSql(viewer, ref(equipmentModels.id)), ['model']],
    ['software', visibleSoftwareSql(viewer, ref(knowledgeItems.ownerSoftwareId)), ['software', 'model']],
    ['item', visibleItemSql(viewer, ref(knowledgeItems.id)), ['item', 'software', 'model']],
  ])('%s: checks deny and allow on every level, only active rules, and binds the viewer', (_name, expression, kinds) => {
    const { sql, params } = render(expression);
    // Every level of the chain is judged: a deny test and an allow test per level.
    expect(sql.match(/acc_r\.effect = \$/g)?.length).toBe(kinds.length * 2);
    expect(params).toEqual(expect.arrayContaining([viewer.workspaceId, viewer.actorId, 'deny', 'allow', ...kinds]));
    expect(sql).toContain('acc_r.revoked_at is null');
    expect(sql).toContain('acc_r.valid_until > now()');
    // The viewer is a bound parameter, never part of the text.
    expect(sql).not.toContain(viewer.actorId);
  });
});
