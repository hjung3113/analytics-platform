// Same direct knowledge read projection as lifecycle-read.ts; no active filter (the model list includes inactive rows).
import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, visibleModelSql, visibleSoftwareSql } from '../../log-knowledge/index.js';
import { projectVisibleSql } from './access-visibility.js';

export interface HierarchyNode {
  id: string;
  parentId: string | null;
  kind: string;
  label: string;
  hasChildren: boolean;
  target: { menuId: string; params?: Record<string, string>; page?: Record<string, string> };
}

/** One workspace-scoped graph, projected in SQL so children/search pages never load an entire graph into the app. */
function graph(viewer: Viewer): SQL {
  const workspaceId = viewer.workspaceId;
  return sql`with
    v as (select id, name from knowledge.vendor where workspace_id = ${workspaceId}),
    m as (select id, vendor_id, name from knowledge.equipment_model hm where workspace_id = ${workspaceId} and ${visibleModelSql(viewer, sql`hm.id`)}),
    pc as (select id, name from knowledge.process_category where workspace_id = ${workspaceId}),
    mp as (select model_id, process_id from knowledge.model_process where workspace_id = ${workspaceId}),
    sw as (select id, model_id, version_label as name from knowledge.software_version hs where workspace_id = ${workspaceId} and ${visibleSoftwareSql(viewer, sql`hs.id`)}),
    dp as (select id, model_id from log_lifecycle.development_project hp where workspace_id = ${workspaceId} and ${projectVisibleSql(viewer, sql`hp.id`)} and stage not in ('completed','cancelled')),
    paths as (
      select m.id as model_id, m.vendor_id, m.name, pc.id::text as process_id, pc.name as process_name,
        'v/' || m.vendor_id || '/p/' || pc.id as process_path
      from m join mp on mp.model_id = m.id join pc on pc.id = mp.process_id
      union all
      select m.id, m.vendor_id, m.name, 'none', '미분류', 'v/' || m.vendor_id || '/p/none'
      from m where not exists (select 1 from mp where mp.model_id = m.id)
    ),
    model_nodes as (
      select paths.*, process_path || '/m/' || paths.model_id as model_path, dp.id as project_id,
        case when dp.id is null then jsonb_build_object('menuId','log-models','page',jsonb_build_object('vendorId',paths.vendor_id,'processId',paths.process_id,'modelId',paths.model_id))
        else jsonb_build_object('menuId','log-model-project','params',jsonb_build_object('projectId',dp.id),'page',jsonb_build_object('node',process_path || '/m/' || paths.model_id)) end as target
      from paths left join dp on dp.model_id = paths.model_id
    ),
    nodes as (
      select 'v/' || id as id, null::text as parent_id, 'vendor' as kind, name as label,
        jsonb_build_object('menuId','log-models','page',jsonb_build_object('vendorId',id)) as target from v
      union all
      select distinct process_path, 'v/' || vendor_id, 'process', process_name,
        jsonb_build_object('menuId','log-models','page',jsonb_build_object('vendorId',vendor_id,'processId',process_id)) from paths
      union all
      select model_path, process_path, 'model', name, target from model_nodes
      union all
      select mn.model_path || '/s/' || sw.id, mn.model_path, 'software', sw.name,
        case when mn.project_id is null then mn.target
        else jsonb_set(mn.target, '{page,node}', to_jsonb(mn.model_path || '/s/' || sw.id)) end
      from model_nodes mn join sw on sw.model_id = mn.model_id
    )`;
}

export async function hierarchyNodes(tx: Tx, viewer: Viewer, where: SQL, limit: number): Promise<HierarchyNode[]> {
  const result = await tx.execute<HierarchyNode & Record<string, unknown>>(sql`${graph(viewer)}
    select n.id, n.parent_id as "parentId", n.kind, n.label, n.target,
      exists(select 1 from nodes child where child.parent_id = n.id) as "hasChildren"
    from nodes n where ${where} order by n.id collate "C" limit ${limit}`);
  return result.rows;
}
