import { describe, expect, it } from 'vitest';
import type { ModelSpecData } from '../../endpoints';
import { compareSpecDraft, parseSpecDraftText } from './specSummary';

const publication: ModelSpecData = {
  revision: { id: 'r1', modelId: 'm1', revisionNo: 4, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '4' }, contentSha256: null, publishedAt: null, publishedBy: null },
  modules: [{ id: 'mod-1', moduleKey: 'ARM', name: 'Arm', parentModuleId: null }, { id: 'mod-2', moduleKey: 'OLD', name: 'Old', parentModuleId: null }],
  events: [
    { id: 'ev-1', moduleId: 'mod-1', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'on move', detailDocRef: null },
    { id: 'ev-3', moduleId: 'mod-1', eventKey: 'STOP', name: 'Stop', fields: [], triggerRule: null, detailDocRef: null },
    { id: 'ev-2', moduleId: 'mod-2', eventKey: 'GONE', name: 'Gone', fields: [], triggerRule: null, detailDocRef: null },
  ],
  relations: [{ id: 'rel-1', sourceEventId: 'ev-1', predicate: 'before', targetEventId: 'ev-3', ruleRef: 'rule-old' }],
};

describe('spec publication summary', () => {
  it('counts added, changed and removed Modules, Events and relations from parsed TSV rows', () => {
    const parsed = parseSpecDraftText([
      'kind\tmodule\tparent_module\tevent\ttrigger_rule\tfields_json\tsource_module\tsource_event\tpredicate\ttarget_module\ttarget_event\trule_ref',
      'module\tArm',
      'module\tNew',
      'event\tArm\t\tMove\twhen moved\t[]',
      'event\tArm\t\tStop\t\t[]',
      'event\tArm\t\tStart\t\t[]',
      'relation\t\t\t\t\t\tArm\tMove\tbefore\tArm\tStop\trule-new',
    ].join('\n'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(compareSpecDraft(parsed.rows, publication)).toMatchObject({
      state: 'changes',
      counts: {
        module: { added: 1, changed: 0, removed: 1 },
        event: { added: 1, changed: 1, removed: 1 },
        relation: { added: 0, changed: 1, removed: 0 },
      },
    });
  });

  it('distinguishes first publication and a verified zero-change comparison', () => {
    const empty = parseSpecDraftText('kind\tmodule\tevent');
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(compareSpecDraft(empty.rows, null).state).toBe('first_publication');
    const same = parseSpecDraftText([
      'kind\tmodule\tparent_module\tevent\ttrigger_rule\tdetail_doc_ref\tfields_json\tsource_module\tsource_event\tpredicate\ttarget_module\ttarget_event\trule_ref',
      'module\tArm',
      'module\tOld',
      'event\tArm\t\tMove\ton move\t\t[]',
      'event\tArm\t\tStop\t\t\t[]',
      'event\tOld\t\tGone\t\t\t[]',
      'relation\t\t\t\t\t\t\tArm\tMove\tbefore\tArm\tStop\trule-old',
    ].join('\n'));
    expect(same.ok).toBe(true);
    if (same.ok) expect(compareSpecDraft(same.rows, publication).state).toBe('verified_zero');
  });

  it.each(['kind\tmodule\nmodule\tA\tunexpected', 'kind\tmodule\tevent\nmodule\tA\nrelation\t\t\t\t\t\t\tA\tMissing\tbefore\tA\tMissing', 'kind\tmodule\tevent\tfields_json\nevent\tA\tE\t{'])('refuses a draft whose comparison cannot be parsed or resolved', text => {
    expect(parseSpecDraftText(text).ok).toBe(false);
  });

  it.each(['constructor', 'toString'])('treats inherited object key %s as an unknown row kind', kind => {
    expect(parseSpecDraftText(`kind\tmodule\n${kind}\tA`).ok).toBe(false);
  });

  it('normalizes draft event fields to the stored publication shape', () => {
    const published = { ...publication, events: publication.events.map((event, index) => index === 0 ? { ...event, fields: [{ name: 'Amount', type: 'float', description: 'Pressure', allowedValues: ['low', 'high'] }, { name: 'Pressure', type: 'float', description: 'Value', unit: 'kPa' }] } : event), relations: [] };
    const parsed = parseSpecDraftText([
      'kind\tmodule\tevent\ttrigger_rule\tdetail_doc_ref\tfields_json',
      'module\tArm',
      'module\tOld',
      'event\tArm\tMove\ton move\t\t[{"name":"  Amount  ","type":"float","description":" Pressure ","unit":null,"allowedValues":[" low ","high"]},{"name":"Pressure","type":"float","description":" Value ","unit":" kPa "}]',
      'event\tArm\tStop\t\t\t[]',
      'event\tOld\tGone\t\t\t[]',
    ].join('\n'));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(compareSpecDraft(parsed.rows, published as ModelSpecData).state).toBe('verified_zero');
  });

  it.each(['[{"name":" ","type":"string","description":"x"}]', '[{"name":"x","type":"enum","description":"x","allowedValues":[" "]}]'])('refuses field values the server cannot normalize: %s', fields => {
    expect(parseSpecDraftText(`kind\tmodule\tevent\tfields_json\nmodule\tArm\nevent\tArm\tMove\t${fields}`).ok).toBe(false);
  });

  it('marks a malformed loaded publication as unavailable because of publication data', () => {
    const parsed = parseSpecDraftText('kind\tmodule\tevent\ttrigger_rule\tfields_json\nmodule\tArm\nevent\tArm\tMove\ton move\t[]');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(compareSpecDraft(parsed.rows, { ...publication, events: [{ ...publication.events[0]!, moduleId: 'missing' }] })).toMatchObject({ state: 'unavailable', reason: 'publication' });
  });
});
