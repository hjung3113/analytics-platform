import { describe, expect, it } from 'vitest';

import { generateToken } from '../../api-tokens/token-format.js';
import {
  type CatalogReport,
  REPORT_DIGEST_DOMAIN,
  canonicalJson,
  judgeBodySize,
  judgeReport,
  normalizeReport,
  rejectedDigest,
  reportDigest,
  sha256,
} from '../domain/report.js';

const rule = (over: Record<string, unknown> = {}) => ({ ruleKey: 'r1', title: 'Title', summary: 'Summary', support: 'supported', ...over });
const ruleSet = (over: Record<string, unknown> = {}) => ({ ruleSetKey: 'rs', revision: '1', status: 'active', rules: [rule()], ...over });
const report = (over: Record<string, unknown> = {}) => ({ sourceSystem: 'validator', validatorVersion: '1.0', ruleSets: [ruleSet()], ...over });
const body = (value: unknown) => Buffer.from(JSON.stringify(value));
const codes = (value: unknown) => {
  const j = judgeReport(body(value));
  return j.ok ? null : j.fields.map((f) => `${f.path.join('.')}:${f.code}`);
};

describe('judgeReport', () => {
  it('accepts a valid report and counts it', () => {
    const j = judgeReport(body(report({ ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'f', target: 't' }, { format: 'f', target: 'u' }] }), rule({ ruleKey: 'r2' })] })] })));
    expect(j).toMatchObject({ ok: true, counts: { ruleSetCount: 1, ruleCount: 2, targetCount: 2 } });
  });

  it.each([
    ['top level', report({ extra: 1 }), ['extra:unknown_field']],
    ['rule set', report({ ruleSets: [ruleSet({ body: 'x' })] }), ['ruleSets.0.body:unknown_field']],
    ['rule', report({ ruleSets: [ruleSet({ rules: [rule({ condition: 'x>1' })] })] }), ['ruleSets.0.rules.0.condition:unknown_field']],
    ['scope', report({ ruleSets: [ruleSet({ rules: [rule({ scope: { script: 's' } })] })] }), ['ruleSets.0.rules.0.scope.script:unknown_field']],
    ['target', report({ ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'f', target: 't', parameters: {} }] })] })] }), ['ruleSets.0.rules.0.targets.0.parameters:unknown_field']],
  ])('refuses an unknown key at %s level', (_n, input, expected) => {
    expect(codes(input)).toEqual(expected);
  });

  it.each([
    ['leading space', ' a'],
    ['trailing space', 'a '],
    ['control character', 'a\u0001b'],
    ['empty', ''],
    ['201 chars', 'x'.repeat(201)],
  ])('refuses an identifier with %s as invalid_identifier', (_n, value) => {
    expect(codes(report({ ruleSets: [ruleSet({ ruleSetKey: value })] }))).toEqual(['ruleSets.0.ruleSetKey:invalid_identifier']);
    expect(codes(report({ ruleSets: [ruleSet({ revision: value })] }))).toEqual(['ruleSets.0.revision:invalid_identifier']);
    expect(codes(report({ ruleSets: [ruleSet({ resultRef: value })] }))).toEqual(['ruleSets.0.resultRef:invalid_identifier']);
    expect(codes(report({ ruleSets: [ruleSet({ rules: [rule({ ruleKey: value })] })] }))).toEqual(['ruleSets.0.rules.0.ruleKey:invalid_identifier']);
  });

  it('compares identifiers exactly: case and inner spaces are kept', () => {
    const j = judgeReport(body(report({ ruleSets: [ruleSet({ ruleSetKey: 'Rule Set' }), ruleSet({ ruleSetKey: 'rule set' })] })));
    expect(j.ok).toBe(true);
  });

  it.each([
    ['support', { support: 'maybe' }, 'ruleSets.0.rules.0.support:invalid_value'],
    ['title length', { title: 'x'.repeat(121) }, 'ruleSets.0.rules.0.title:too_large'],
    ['summary length', { summary: 'x'.repeat(301) }, 'ruleSets.0.rules.0.summary:too_large'],
    ['target length', { targets: [{ format: 'f', target: 'x'.repeat(501) }] }, 'ruleSets.0.rules.0.targets.0.target:too_large'],
    ['format length', { targets: [{ format: 'x'.repeat(41), target: 't' }] }, 'ruleSets.0.rules.0.targets.0.format:too_large'],
    ['targets per rule', { targets: Array.from({ length: 21 }, () => ({ format: 'f', target: 't' })) }, 'ruleSets.0.rules.0.targets:too_large'],
    ['requirementIds', { targets: [{ format: 'f', target: 't', requirementIds: Array.from({ length: 51 }, (_, i) => `m/${i}`) }] }, 'ruleSets.0.rules.0.targets.0.requirementIds:too_large'],
  ])('refuses a bad %s', (_n, over, expected) => {
    expect(codes(report({ ruleSets: [ruleSet({ rules: [rule(over)] })] }))).toEqual([expected]);
  });

  it('refuses more than 50 RuleSets and more than 5,000 Rules in total', () => {
    expect(codes(report({ ruleSets: Array.from({ length: 51 }, (_, i) => ruleSet({ ruleSetKey: `rs${i}` })) }))).toEqual(['ruleSets:too_large']);
    const many = (n: number, p: string) => Array.from({ length: n }, (_, i) => rule({ ruleKey: `${p}${i}` }));
    expect(codes(report({ ruleSets: [ruleSet({ ruleSetKey: 'a', rules: many(3000, 'a') }), ruleSet({ ruleSetKey: 'b', rules: many(2001, 'b') })] }))).toEqual(['ruleSets:too_large']);
    expect(judgeReport(body(report({ ruleSets: [ruleSet({ ruleSetKey: 'a', rules: many(3000, 'a') }), ruleSet({ ruleSetKey: 'b', rules: many(2000, 'b') })] }))).ok).toBe(true);
  });

  it('refuses a body over 2 MB before parsing it', () => {
    expect(judgeBodySize(2 * 1024 * 1024)).toBeNull();
    expect(judgeBodySize(2 * 1024 * 1024 + 1)).toMatchObject({ ok: false, reason: 'too_large' });
    // not JSON at all: the size judgment wins over invalid_json
    expect(judgeReport(Buffer.alloc(2 * 1024 * 1024 + 1, 'x'))).toMatchObject({ ok: false, reason: 'too_large' });
  });

  it.each([['not json', 'nope'], ['empty', ''], ['an array', '[]']])('refuses %s', (_n, raw) => {
    const j = judgeReport(Buffer.from(raw));
    expect(j.ok).toBe(false);
  });
  it('refuses ill-formed Unicode: a lone surrogate in an identifier, title, scope or target is control_character; a valid pair passes (review C2)', () => {
    const withLone = (field: Record<string, unknown>, escape = '\\ud800') =>
      Buffer.from(JSON.stringify(report({ ruleSets: [ruleSet({ rules: [rule(field)] })] })).replace('LONE', escape));
    for (const field of [{ ruleKey: 'rLONE' }, { title: 'tLONE' }, { scope: { softwareRange: 'LONE' } }, { targets: [{ format: 'f', target: 'LONE' }] }]) {
      const j = judgeReport(withLone(field));
      expect(j.ok).toBe(false);
      expect(j.ok ? [] : j.fields.map((f) => f.code)).toContain('control_character');
    }
    expect(judgeReport(withLone({ title: 'LONE' }, '\\udc00')).ok).toBe(false); // a lone low surrogate too
    expect(judgeReport(withLone({ title: 'LONE' }, '\\ud83d\\ude00')).ok).toBe(true); // a valid pair
  });
  it('refuses invalid UTF-8 bytes instead of replacing them (review C2)', () => {
    const bad = Buffer.concat([Buffer.from('{"sourceSystem":"v","validatorVersion":"'), Buffer.from([0xff, 0xfe]), Buffer.from('","ruleSets":[]}')]);
    expect(judgeReport(bad)).toMatchObject({ ok: false, reason: 'invalid_json' });
  });
  it('keys a rejected body by its own domain: the bytes that feed a valid digest do not collide with it (review C1)', () => {
    const normalized = normalizeReport(report() as unknown as CatalogReport);
    const collider = Buffer.from(REPORT_DIGEST_DOMAIN + canonicalJson(normalized));
    expect(sha256(collider)).toBe(reportDigest(normalized)); // the old rejected-body digest would have been exactly this
    expect(rejectedDigest(collider)).not.toBe(reportDigest(normalized));
  });
  it('invalid_json for unparsable bytes', () => {
    expect(judgeReport(Buffer.from('{'))).toMatchObject({ ok: false, reason: 'invalid_json' });
  });

  it.each([
    ['same RuleSet and revision', report({ ruleSets: [ruleSet(), ruleSet()] }), 'ruleSets.1.revision:duplicate_key'],
    ['same ruleKey in one revision', report({ ruleSets: [ruleSet({ rules: [rule(), rule()] })] }), 'ruleSets.0.rules.1.ruleKey:duplicate_key'],
    ['same resultRef for two revisions of one RuleSet', report({ ruleSets: [ruleSet({ resultRef: 'x' }), ruleSet({ revision: '2', resultRef: 'x' })] }), 'ruleSets.1.resultRef:duplicate_key'],
    ['a resultRef equal to another revision string', report({ ruleSets: [ruleSet({ revision: '1' }), ruleSet({ revision: '2', resultRef: '1' })] }), 'ruleSets.1.resultRef:duplicate_key'],
  ])('refuses a duplicate: %s', (_n, input, expected) => {
    expect(codes(input)).toContain(expected);
  });

  it('allows the same ruleKey in two revisions and the same resultRef in two RuleSets', () => {
    const j = judgeReport(body(report({ ruleSets: [ruleSet({ resultRef: 'x' }), ruleSet({ revision: '2' }), ruleSet({ ruleSetKey: 'other', resultRef: 'x' })] })));
    expect(j.ok).toBe(true);
  });

  const secretText = 'AKIAIOSFODNN7EXAMPLE';
  it.each([
    ['title', (v: string) => ({ ruleSets: [ruleSet({ rules: [rule({ title: v })] })] }), 'ruleSets.0.rules.0.title'],
    ['summary', (v: string) => ({ ruleSets: [ruleSet({ rules: [rule({ summary: v })] })] }), 'ruleSets.0.rules.0.summary'],
    ['target', (v: string) => ({ ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'f', target: v }] })] })] }), 'ruleSets.0.rules.0.targets.0.target'],
    ['format', (v: string) => ({ ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: v, target: 't' }] })] })] }), 'ruleSets.0.rules.0.targets.0.format'],
    ['requirementIds', (v: string) => ({ ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'f', target: 't', requirementIds: [v] }] })] })] }), 'ruleSets.0.rules.0.targets.0.requirementIds.0'],
    ['scope', (v: string) => ({ ruleSets: [ruleSet({ rules: [rule({ scope: { logTypes: [v] } })] })] }), 'ruleSets.0.rules.0.scope.logTypes.0'],
    ['sourceSystem', (v: string) => ({ sourceSystem: v }), 'sourceSystem'],
  ])('refuses a secret pattern in %s and does not keep it as a source', (_n, build, path) => {
    const j = judgeReport(body(report(build(secretText))));
    expect(j).toMatchObject({ ok: false, reason: 'secret_pattern' });
    if (!j.ok) {
      expect(j.fields.map((f) => f.path.join('.'))).toContain(path);
      if (path === 'sourceSystem') expect(j.sourceSystem).toBeNull();
    }
  });

  it('refuses a real API token value in a summary', () => {
    expect(codes(report({ ruleSets: [ruleSet({ rules: [rule({ summary: `use ${generateToken().value}` })] })] }))).toEqual(['ruleSets.0.rules.0.summary:secret_pattern']);
  });

  it('refuses a control character in free text (no stripping)', () => {
    expect(codes(report({ ruleSets: [ruleSet({ rules: [rule({ summary: 'a\u0007b' })] })] }))).toEqual(['ruleSets.0.rules.0.summary:control_character']);
    expect(codes(report({ ruleSets: [ruleSet({ rules: [rule({ summary: 'a\nb' })] })] }))).toEqual(['ruleSets.0.rules.0.summary:control_character']);
  });

  it('keeps a clean source system on a rejected report', () => {
    const j = judgeReport(body(report({ ruleSets: [ruleSet(), ruleSet()] })));
    expect(j).toMatchObject({ ok: false, sourceSystem: 'validator' });
  });
});

describe('digest', () => {
  const parse = (v: unknown) => {
    const j = judgeReport(body(v));
    if (!j.ok) throw new Error('invalid fixture');
    return j.report as CatalogReport;
  };
  const digestOf = (v: unknown) => reportDigest(normalizeReport(parse(v)));

  it('ignores key order, RuleSet order, Rule order and a defaulted resultRef', () => {
    const a = report({ ruleSets: [ruleSet({ ruleSetKey: 'a', rules: [rule({ ruleKey: 'x' }), rule({ ruleKey: 'y' })] }), ruleSet({ ruleSetKey: 'b' })] });
    const b = {
      ruleSets: [
        { status: 'active', revision: '1', ruleSetKey: 'b', resultRef: '1', rules: [rule()] },
        { rules: [rule({ ruleKey: 'y' }), rule({ ruleKey: 'x' })], status: 'active', revision: '1', ruleSetKey: 'a' },
      ],
      validatorVersion: '1.0',
      sourceSystem: 'validator',
    };
    expect(digestOf(a)).toBe(digestOf(b));
    expect(digestOf(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with any stored value, including target order', () => {
    const base = digestOf(report());
    expect(digestOf(report({ validatorVersion: '1.1' }))).not.toBe(base);
    expect(digestOf(report({ ruleSets: [ruleSet({ status: 'retired' })] }))).not.toBe(base);
    expect(digestOf(report({ ruleSets: [ruleSet({ rules: [rule({ support: 'unknown' })] })] }))).not.toBe(base);
    const t1 = { format: 'f', target: '1' };
    const t2 = { format: 'f', target: '2' };
    const withTargets = (targets: unknown[]) => digestOf(report({ ruleSets: [ruleSet({ rules: [rule({ targets })] })] }));
    expect(withTargets([t1, t2])).not.toBe(withTargets([t2, t1]));
  });

  it('sha256 of raw bytes is the rejected-report digest', () => {
    expect(sha256(Buffer.from('a'))).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
  });
});
