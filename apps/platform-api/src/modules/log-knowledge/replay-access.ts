// Replays disclose the same objects as fresh commands, while keeping their exactly-once writes.
import { and, eq } from 'drizzle-orm';
import { knowledgeDrafts, modelSpecRevisions, specConceptMappings, specSwChanges } from '../../db/schema/knowledge.js';
import type { Tx } from '../../db/tx.js';
import type { ActionAnswer, MenuActionDeclaration } from '../menu-dispatch/types.js';
import type { Viewer } from './repositories/access-visibility.js';
import { canSeeItem, canSeeModel, canSeeSoftware, viewerOf } from './repositories/access-visibility.js';
import { ownerVisible } from './repositories/draft-read.js';
import { getVisibleJob } from './repositories/import-repo.js';

export async function draftAccessVisible(tx: Tx, viewer: Viewer, id: string): Promise<boolean> {
  const d = knowledgeDrafts;
  const [row] = await tx.select({ id: d.id }).from(d).where(and(eq(d.workspaceId, viewer.workspaceId), eq(d.id, id), ownerVisible(viewer)));
  return row !== undefined;
}

export function withReplayAccess(declaration: MenuActionDeclaration): MenuActionDeclaration {
  // Explicit access-management exception: management capability, never an implicit read bypass.
  if (declaration.spec.id.startsWith('logKnowledge.access')) return declaration;
  return { ...declaration, async canReplay(tx, actor, input, saved: ActionAnswer) {
    const viewer = viewerOf(actor);
    const op = declaration.spec.id.slice('logKnowledge.'.length);
    const judge = async (key: string, id: unknown): Promise<boolean> => {
      if (typeof id !== 'string') return true;
      if (['modelId', 'ownerModelId', 'peerModelId'].includes(key)) return canSeeModel(tx, viewer, id);
      if (['softwareId', 'ownerSoftwareId', 'endsBeforeSoftwareId', 'fromSoftwareId'].includes(key)) return canSeeSoftware(tx, viewer, id);
      if (['itemId', 'targetItemId', 'sourceItemId', 'originalItemId'].includes(key)) return canSeeItem(tx, viewer, id);
      if (key === 'draftId') return draftAccessVisible(tx, viewer, id);
      if (key === 'mapTargetId') return op.startsWith('import');
      if (key === 'jobId') return (await getVisibleJob(tx, viewer, id)) !== null;
      if (key === 'revisionId' || key === 'mappingId' || key === 'pairMappingId') {
        const t = key === 'revisionId' ? modelSpecRevisions : specConceptMappings;
        const [row] = await tx.select({ modelId: t.modelId }).from(t).where(and(eq(t.workspaceId, viewer.workspaceId), eq(t.id, id)));
        return !!row && await canSeeModel(tx, viewer, row.modelId);
      }
      if (key === 'changeId' || key === 'replacementChangeId') {
        const c = specSwChanges;
        const [row] = await tx.select().from(c).where(and(eq(c.workspaceId, viewer.workspaceId), eq(c.id, id)));
        return !!row && await canSeeSoftware(tx, viewer, row.softwareId) && (!row.endsBeforeSoftwareId || await canSeeSoftware(tx, viewer, row.endsBeforeSoftwareId));
      }
      if (key === 'id') {
        if (op.startsWith('model')) return canSeeModel(tx, viewer, id);
        if (op.startsWith('software')) return canSeeSoftware(tx, viewer, id);
        if (op.startsWith('item')) return canSeeItem(tx, viewer, id);
        if (op.startsWith('draft')) return draftAccessVisible(tx, viewer, id);
      }
      return true;
    };
    // These are closed command/response shapes, not scans of user text or arbitrary UUIDs.
    const visit = async (value: unknown): Promise<boolean> => {
      if (!value || typeof value !== 'object') return true;
      for (const [key, child] of Object.entries(value)) {
        if (!(await judge(key, child))) return false;
        if (['proposal', 'subjects', 'pairWith', 'replacement', 'resolutions'].includes(key)) {
          for (const nested of Array.isArray(child) ? child : [child]) if (!(await visit(nested))) return false;
        }
      }
      return true;
    };
    return await visit(input) && await visit(saved.data);
  } };
}
