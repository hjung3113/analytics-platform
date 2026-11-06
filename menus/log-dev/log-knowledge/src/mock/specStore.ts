/** Deterministic model-spec state. Mock handlers own copies; no screen imports this store. */
import type { ModelSpecData, SpecChangeRow, SpecDraftData, SpecRevisionHeader } from '../endpoints';
import { specCanonical, specHash } from './specHash';
import { all, insert, toCodeKey } from './store';

export const SPEC_MODEL = '00000003-0000-4000-8000-000000000008';
export const SPEC_AT = '2026-11-01T00:00:00.000Z';
export type Revision = { revision: Omit<SpecDraftData['revision'], 'state'> & { state: SpecRevisionHeader['state']; contentSha256: string | null; publishedAt: string | null; publishedBy: string | null }; modules: ModelSpecData['modules']; events: ModelSpecData['events']; relations: ModelSpecData['relations'] };
export type Change = SpecChangeRow & { modelId: string };
let revisions: Revision[] = [];
let changes: Change[] = [];
let sequence = 100;
export const specId = () => `00000007-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`;
export const specRevisions = () => revisions;
export const specChanges = () => changes;
export const latestSpec = (model: string) => revisions.filter(r => r.revision.modelId === model.toLowerCase() && r.revision.state === 'published').sort((a, b) => b.revision.revisionNo - a.revision.revisionNo)[0];
export const revisionById = (id: string) => revisions.find(r => r.revision.id === id.toLowerCase());
export const changeById = (id: string) => changes.find(c => c.id === id.toLowerCase());
export const escapeKey = (s: string) => s.replace(/%/g, '%25').replace(/\//g, '%2F').replace(/#/g, '%23');
export const key = (s: string) => escapeKey(toCodeKey(s));
export const eventKey = (m: string, e: string) => `${key(m)}/${key(e)}`;
export function resetSpecs() {
  sequence = 100; revisions = []; changes = [];
  if (all('software').filter(s => s.parentId === SPEC_MODEL).length === 2) insert('software', 'v2.1', 'Maintenance', SPEC_MODEL);
  const revision: Revision['revision'] = { id: specId(), modelId: SPEC_MODEL, revisionNo: 1, state: 'published', schemaVersion: 1,
    sourceDocRef: { docLabel: 'Alpha log specification', docVersion: '1' }, version: 1, createdAt: SPEC_AT, createdBy: 'admin', contentSha256: 'a'.repeat(64), publishedAt: SPEC_AT, publishedBy: 'admin' };
  const chamber = specId(), robot = specId(), arm = specId();
  revisions.push({ revision, modules: [{ id: chamber, moduleKey: 'CHAMBER', name: 'Chamber', parentModuleId: null }, { id: robot, moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }, { id: arm, moduleKey: 'ARM', name: 'Arm', parentModuleId: robot }],
    events: [{ id: specId(), moduleId: chamber, eventKey: 'START', name: 'Start', fields: [{ name: 'temperature', type: 'float', unit: 'C', description: 'Temperature' }], triggerRule: 'on start', detailDocRef: '§1' }, { id: specId(), moduleId: robot, eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'on move', detailDocRef: '§2' }, { id: specId(), moduleId: arm, eventKey: 'STOP', name: 'Stop', fields: [], triggerRule: null, detailDocRef: null }], relations: [] });
  revision.contentSha256 = specHash(specCanonical(revisions[0]!));
  const sw = all('software').filter(s => s.parentId === SPEC_MODEL);
  const seed = (targetKey: string, changeKind: Change['changeKind'], change: Change['change'], patch: Partial<Change> = {}) => {
    const rec: Change = { id: specId(), modelId: SPEC_MODEL, softwareId: sw[1]!.id, softwareLabel: sw[1]!.code, endsBeforeSoftwareId: null, endsBeforeLabel: null, targetKind: 'event', targetKey, changeKind, change, note: null, basedOnRevNo: 1, evidenceRef: null, needsRevalidation: false, revalidationRevNo: null, retiredAt: null, retiredBy: null, retiredByChangeId: null, createdAt: SPEC_AT, createdBy: 'admin', version: 1, ...patch };
    changes.push(rec); return rec;
  };
  seed('CHAMBER/START', 'changed', { before: { name: 'Start', triggerRule: 'on start', detailDocRef: '§1' }, after: { name: 'Start', triggerRule: 'after ready', detailDocRef: '§1' } }, { needsRevalidation: true, revalidationRevNo: 1 });
  seed('ROBOT/READY', 'added', { after: { name: 'Ready', triggerRule: 'ready', detailDocRef: null } });
  seed('ARM/STOP', 'removed', { before: { name: 'Stop', triggerRule: null, detailDocRef: null } }, { endsBeforeSoftwareId: sw[2]!.id, endsBeforeLabel: sw[2]!.code });
  seed('CHAMBER/GHOST', 'behavior', {}, { note: 'Target removed by a later revision', needsRevalidation: true, revalidationRevNo: 1 });
  const old = seed('ROBOT/MOVE', 'behavior', {}, { retiredAt: SPEC_AT, retiredBy: 'admin', note: 'Replaced' });
  old.retiredByChangeId = seed('ROBOT/MOVE', 'behavior', {}, { note: 'Timing documented' }).id;
  seedPairModel();
}
/** The second spec'd model of the concept fixtures (#1196 e/f): B-10 has two published revisions, the second without `ROBOT/CALIBRATE`. */
export const pairModelId = (): string => all('model').find(m => m.code === 'B-10')!.id;
function seedPairModel() {
  const modelId = pairModelId();
  const publish = (revisionNo: number, withCalibrate: boolean) => {
    const revision: Revision['revision'] = { id: specId(), modelId, revisionNo, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Beta log specification', docVersion: String(revisionNo) }, version: 1, createdAt: SPEC_AT, createdBy: 'admin', contentSha256: null, publishedAt: SPEC_AT, publishedBy: 'admin' };
    const chamber = specId(), robot = specId(), arm = specId();
    const rev: Revision = { revision, modules: [{ id: chamber, moduleKey: 'CHAMBER', name: 'Chamber', parentModuleId: null }, { id: robot, moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }, { id: arm, moduleKey: 'ARM', name: 'Arm', parentModuleId: robot }],
      events: [{ id: specId(), moduleId: chamber, eventKey: 'START', name: 'Start', fields: [{ name: 'temperature', type: 'float', unit: 'C', description: 'Temperature' }, { name: 'pressure', type: 'float', unit: 'Pa', description: 'Pressure' }], triggerRule: 'on start', detailDocRef: null }, { id: specId(), moduleId: robot, eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'on move', detailDocRef: null }, { id: specId(), moduleId: arm, eventKey: 'STOP', name: 'Stop', fields: [], triggerRule: null, detailDocRef: null }, ...(withCalibrate ? [{ id: specId(), moduleId: robot, eventKey: 'CALIBRATE', name: 'Calibrate', fields: [], triggerRule: 'on calibrate', detailDocRef: null }] : [])], relations: [] };
    revision.contentSha256 = specHash(specCanonical(rev));
    revisions.push(rev);
  };
  publish(1, true); publish(2, false);
}
resetSpecs();
