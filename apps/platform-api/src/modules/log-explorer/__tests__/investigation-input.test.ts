import { describe, expect, it } from 'vitest';

import {
  parseCreate,
  parseEvidenceAdd,
  parseEvidenceRemove,
  parseFilters,
  parseUpdate,
  validateExplorerInput,
} from '../domain/investigation-input.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const H = 'a'.repeat(64);
const SET = { files: [{ fileRef: 's3://x/a.log', order: 1, sha256: H }], sourceOwner: 'fab' };

describe('parseFilters', () => {
  it('accepts identifier keys with scalar or scalar-list values', () => {
    expect(parseFilters({ level: 'ERROR', lines: [1, 2], flag: true, none: null })).toMatchObject({ ok: true });
    expect(parseFilters({})).toEqual({ ok: true, value: {} });
  });

  it.each([
    ['a value in the key', { 'level = ERROR': 'x' }, ['filters', 'level = ERROR'], 'malformed'],
    ['a nested object', { level: { a: 1 } }, ['filters', 'level'], 'malformed'],
    ['a nested list', { level: [[1]] }, ['filters', 'level'], 'malformed'],
    ['a text over 500', { level: 'x'.repeat(501) }, ['filters', 'level'], 'malformed'],
    ['a list over 50', { level: Array.from({ length: 51 }, () => 'x') }, ['filters', 'level'], 'too_many'],
    ['a non-object', [], ['filters'], 'malformed'],
    ['null', null, ['filters'], 'required'],
  ])('refuses %s', (_label, raw, path, code) => {
    expect(parseFilters(raw)).toEqual({ ok: false, errors: [{ path, code }] });
  });

  it('refuses more than 50 keys', () => {
    const many = Object.fromEntries(Array.from({ length: 51 }, (_v, i) => [`k${i}`, 1]));
    expect(parseFilters(many)).toEqual({ ok: false, errors: [{ path: ['filters'], code: 'too_many' }] });
  });
});

describe('parseCreate', () => {
  it('standalone needs a sample set and no round id; round needs a round id and no sample set', () => {
    expect(parseCreate({ title: ' T ', origin: 'standalone', sampleSet: SET })).toMatchObject({ ok: true, value: { title: 'T', origin: 'standalone' } });
    expect(parseCreate({ title: 'T', origin: 'round', roundId: ID.toUpperCase() })).toEqual({ ok: true, value: { title: 'T', origin: 'round', roundId: ID } });
    expect(parseCreate({ title: 'T', origin: 'standalone', sampleSet: SET, roundId: ID })).toEqual({ ok: false, errors: [{ path: ['roundId'], code: 'malformed' }] });
    expect(parseCreate({ title: 'T', origin: 'round', roundId: ID, sampleSet: SET })).toEqual({ ok: false, errors: [{ path: ['sampleSet'], code: 'malformed' }] });
  });

  it.each([
    ['no title', { origin: 'standalone', sampleSet: SET }, 'title', 'required'],
    ['a blank title', { title: '  ', origin: 'standalone', sampleSet: SET }, 'title', 'required'],
    ['a title over 200', { title: 'x'.repeat(201), origin: 'standalone', sampleSet: SET }, 'title', 'too_long'],
    ['no origin', { title: 'T', sampleSet: SET }, 'origin', 'required'],
    ['an unknown origin', { title: 'T', origin: 'other', sampleSet: SET }, 'origin', 'malformed'],
    ['no sample set', { title: 'T', origin: 'standalone' }, 'sampleSet', 'required'],
    ['no round id', { title: 'T', origin: 'round' }, 'roundId', 'required'],
    ['a bad round id', { title: 'T', origin: 'round', roundId: 'x' }, 'roundId', 'malformed'],
  ])('refuses %s', (_label, input, path, code) => {
    expect(parseCreate(input)).toEqual({ ok: false, errors: [{ path: [path], code }] });
  });
});

describe('parseUpdate / evidence inputs', () => {
  it('needs at least one of title and filters', () => {
    expect(parseUpdate({ id: ID })).toEqual({ ok: false, errors: [{ path: ['title'], code: 'required' }] });
    expect(parseUpdate({ id: ID, filters: {} })).toMatchObject({ ok: true });
    expect(parseUpdate({ id: ID, title: ' T ' })).toEqual({ ok: true, value: { id: ID, title: 'T' } });
  });

  it('parses the add ref and the remove key, and refuses a body on add', () => {
    const ref = { fileRef: 's3://x/a.log', line: 3, fileSha256: H };
    expect(parseEvidenceAdd({ id: ID, ref })).toMatchObject({ ok: true });
    expect(parseEvidenceAdd({ id: ID, ref: { ...ref, body: 'x' } })).toEqual({ ok: false, errors: [{ path: ['ref', 'body'], code: 'malformed' }] });
    expect(parseEvidenceRemove({ id: ID, ref: { fileRef: 's3://x/a.log', line: 3 } })).toMatchObject({ ok: true });
  });

  it('validateExplorerInput answers an empty list for valid input and the errors otherwise', () => {
    expect(validateExplorerInput('investigationArchive', { id: ID })).toEqual([]);
    expect(validateExplorerInput('investigationArchive', { id: 'x' })).toEqual([{ path: ['id'], code: 'malformed' }]);
  });
});
