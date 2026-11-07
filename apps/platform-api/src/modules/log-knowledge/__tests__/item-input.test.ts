import { describe, expect, it } from 'vitest';

import {
  BODY_MAX,
  CHANGE_NOTE_MAX,
  EVIDENCE_MAX,
  EVIDENCE_NOTE_MAX,
  RATIONALE_MAX,
  TITLE_MAX,
  parseItemInput,
  validateItemInput,
} from '../domain/item-input.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const long = (n: number) => 'x'.repeat(n);
const content = { typeCode: 'anomaly', title: 'Chamber drift', observation: 'seen' };
const pointer = { sourceKind: 'log_file', sourceOwner: 'ops', sourceRef: 'run-1' };
const codes = (op: Parameters<typeof validateItemInput>[0], input: Record<string, unknown>) =>
  validateItemInput(op, input).map((e) => `${e.path.join('.')}:${e.code}`);

describe('validateItemInput accepts', () => {
  it.each([
    ['create', { ownerModelId: ID, ...content }],
    ['create', { ownerSoftwareId: ID, ownerModelId: null, typeCode: 'guideline', title: 'T', expected: 'e' }],
    ['create', { ownerModelId: ID, ...content, evidence: [pointer, { ...pointer, sourceKind: 'other', note: 'n' }] }],
    ['create', { ownerModelId: ID, ...content, title: long(TITLE_MAX), observation: long(BODY_MAX) }],
    ['revise', { id: ID, ...content, changeNote: 'fix' }],
    ['revise', { id: ID, ...content, changeNote: long(CHANGE_NOTE_MAX), evidence: [] }],
    ['assess', { id: ID, dimension: 'verification', newState: 'verified', rationale: 'why' }],
    ['assess', { id: ID, dimension: 'processing', newState: 'resolved', rationale: long(RATIONALE_MAX) }],
    ['derive', { sourceItemId: ID, sourceRevisionNo: 2, ownerModelId: ID2, ...content }],
    ['setArchived', { id: ID, archived: false }],
  ] as const)('a valid %s', (op, input) => {
    expect(validateItemInput(op, input)).toEqual([]);
  });
});

describe('validateItemInput refuses', () => {
  it.each([
    ['create: both owners', 'create', { ownerModelId: ID, ownerSoftwareId: ID2, ...content }, ['owner:required_one']],
    ['create: no owner', 'create', { ...content }, ['owner:required_one']],
    ['create: owner null', 'create', { ownerModelId: null, ...content }, ['owner:required_one']],
    ['create: owner not a uuid', 'create', { ownerModelId: 'nope', ...content }, ['ownerModelId:malformed']],
    ['create: owner id not a string', 'create', { ownerModelId: 5, ...content }, ['ownerModelId:required']],
    ['create: no title', 'create', { ownerModelId: ID, typeCode: 'anomaly', observation: 'o' }, ['title:required']],
    ['create: blank title', 'create', { ownerModelId: ID, ...content, title: '   ' }, ['title:required']],
    ['create: title too long', 'create', { ownerModelId: ID, ...content, title: long(TITLE_MAX + 1) }, ['title:too_long']],
    ['create: NUL in title', 'create', { ownerModelId: ID, ...content, title: 'a\u0000b' }, ['title:malformed']],
    ['create: unknown type', 'create', { ownerModelId: ID, ...content, typeCode: 'bug' }, ['typeCode:malformed']],
    ['create: no type', 'create', { ownerModelId: ID, title: 'T', observation: 'o' }, ['typeCode:required']],
    ['create: no observation nor expected', 'create', { ownerModelId: ID, typeCode: 'anomaly', title: 'T' }, ['observation:required_one']],
    ['create: both blank', 'create', { ownerModelId: ID, typeCode: 'anomaly', title: 'T', observation: ' ', expected: '' }, ['observation:required_one']],
    ['create: body too long', 'create', { ownerModelId: ID, ...content, improvement: long(BODY_MAX + 1) }, ['improvement:too_long']],
    ['create: body not a string', 'create', { ownerModelId: ID, ...content, analysisOpinion: 5 }, ['analysisOpinion:required']],
    ['create: title not a string', 'create', { ownerModelId: ID, typeCode: 'anomaly', observation: 'o', title: 5 }, ['title:required']],
    ['create: evidence not a list', 'create', { ownerModelId: ID, ...content, evidence: 'x' }, ['evidence:required']],
    ['create: too many evidence', 'create', { ownerModelId: ID, ...content, evidence: Array.from({ length: EVIDENCE_MAX + 1 }, () => pointer) }, ['evidence:too_long']],
    ['create: evidence kind unknown', 'create', { ownerModelId: ID, ...content, evidence: [{ ...pointer, sourceKind: 'video' }] }, ['evidence.0.sourceKind:malformed']],
    ['create: evidence kind missing', 'create', { ownerModelId: ID, ...content, evidence: [{ sourceOwner: 'o', sourceRef: 'r' }] }, ['evidence.0.sourceKind:required']],
    ['create: evidence owner blank', 'create', { ownerModelId: ID, ...content, evidence: [{ ...pointer, sourceOwner: ' ' }] }, ['evidence.0.sourceOwner:required']],
    ['create: evidence ref missing', 'create', { ownerModelId: ID, ...content, evidence: [{ sourceKind: 'spec', sourceOwner: 'o' }] }, ['evidence.0.sourceRef:required']],
    ['create: evidence note too long', 'create', { ownerModelId: ID, ...content, evidence: [pointer, { ...pointer, note: long(EVIDENCE_NOTE_MAX + 1) }] }, ['evidence.1.note:too_long']],
    ['create: evidence entry not an object', 'create', { ownerModelId: ID, ...content, evidence: ['x'] }, ['evidence.0:required']],
    ['revise: no id', 'revise', { ...content, changeNote: 'c' }, ['id:required']],
    ['revise: id not a uuid', 'revise', { id: '1', ...content, changeNote: 'c' }, ['id:malformed']],
    ['revise: no change note', 'revise', { id: ID, ...content }, ['changeNote:required']],
    ['revise: blank change note', 'revise', { id: ID, ...content, changeNote: '  ' }, ['changeNote:required']],
    ['revise: change note too long', 'revise', { id: ID, ...content, changeNote: long(CHANGE_NOTE_MAX + 1) }, ['changeNote:too_long']],
    ['revise: no content', 'revise', { id: ID, typeCode: 'guideline', title: 'T', changeNote: 'c' }, ['observation:required_one']],
    ['assess: unknown dimension', 'assess', { id: ID, dimension: 'publication', newState: 'open', rationale: 'r' }, ['dimension:malformed']],
    ['assess: state of the other dimension', 'assess', { id: ID, dimension: 'verification', newState: 'open', rationale: 'r' }, ['newState:invalid_state']],
    ['assess: processing state for verification', 'assess', { id: ID, dimension: 'processing', newState: 'verified', rationale: 'r' }, ['newState:invalid_state']],
    ['assess: no new state', 'assess', { id: ID, dimension: 'processing', rationale: 'r' }, ['newState:required']],
    ['assess: no rationale', 'assess', { id: ID, dimension: 'processing', newState: 'open' }, ['rationale:required']],
    ['assess: rationale too long', 'assess', { id: ID, dimension: 'processing', newState: 'open', rationale: long(RATIONALE_MAX + 1) }, ['rationale:too_long']],
    ['derive: no source item', 'derive', { sourceRevisionNo: 1, ownerModelId: ID, ...content }, ['sourceItemId:required']],
    ['derive: revision 0', 'derive', { sourceItemId: ID, sourceRevisionNo: 0, ownerModelId: ID, ...content }, ['sourceRevisionNo:malformed']],
    ['derive: revision 1.5', 'derive', { sourceItemId: ID, sourceRevisionNo: 1.5, ownerModelId: ID, ...content }, ['sourceRevisionNo:malformed']],
    ['derive: revision a string', 'derive', { sourceItemId: ID, sourceRevisionNo: '1', ownerModelId: ID, ...content }, ['sourceRevisionNo:required']],
    ['derive: both owners', 'derive', { sourceItemId: ID, sourceRevisionNo: 1, ownerModelId: ID, ownerSoftwareId: ID2, ...content }, ['owner:required_one']],
    ['derive: no owner', 'derive', { sourceItemId: ID, sourceRevisionNo: 1, ...content }, ['owner:required_one']],
    ['setArchived: no flag', 'setArchived', { id: ID }, ['archived:required']],
    ['setArchived: flag not a boolean', 'setArchived', { id: ID, archived: 'yes' }, ['archived:required']],
  ] as const)('%s', (_label, op, input, expected) => {
    expect(codes(op, input)).toEqual(expected);
  });
});

describe('parseItemInput normalises', () => {
  it('trims title and change note, turns blank body and evidence text into null, and numbers nothing', () => {
    const parsed = parseItemInput('revise', {
      id: ID,
      typeCode: 'behavior_note',
      title: '  Drift  ',
      observation: 'raw  text ',
      expected: '   ',
      changeNote: ' c ',
      evidence: [{ ...pointer, sourceOwner: ' ops ', note: ' ', locator: ' L1 ' }],
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        id: ID,
        typeCode: 'behavior_note',
        title: 'Drift',
        observation: 'raw  text ',
        expected: null,
        analysisOpinion: null,
        improvement: null,
        changeNote: 'c',
        evidence: [
          { sourceKind: 'log_file', sourceOwner: 'ops', sourceRef: 'run-1', sourceVersion: null, contentHash: null, locator: 'L1', note: null },
        ],
      },
    });
  });

  it('treats absent evidence as none', () => {
    const parsed = parseItemInput('create', { ownerModelId: ID, ...content });
    expect(parsed.ok && parsed.value.evidence).toEqual([]);
  });
});
