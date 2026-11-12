import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDirectoryProvider, createProviderSourceReadPort } from '../adapters/provider-source.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(text = 'first\nsecond\nthird\n') {
  const root = await mkdtemp(join(tmpdir(), 'source-1817-')); dirs.push(root);
  await writeFile(join(root, 'sample.log'), text);
  const sampleSet = { sourceOwner: 'fixture', files: [{ fileRef: 'sample.log', order: 1, sha256: createHash('sha256').update(text).digest('hex') }] };
  const port = createProviderSourceReadPort(createDirectoryProvider({ fixture: root }, 64 * 1024 * 1024));
  const ctx = { signal: new AbortController().signal, timeBudgetMs: 10_000, trustedSampleSet: sampleSet };
  const request = { sourceOwner: 'fixture', fileRef: 'sample.log', line: 2, before: 1, after: 1 };
  return { root, sampleSet, port, ctx, request };
}
describe('directory Source window', () => {
  it('returns the verified registered window in file order', async () => {
    const f = await fixture();
    expect(await f.port.getWindow(f.request, f.ctx)).toMatchObject({ status: 'ok', rows: [{ line: 1, text: 'first', fileOrder: 1 }, { line: 2, text: 'second' }, { line: 3, text: 'third' }] });
  });
  it.each(['hash', 'missing', 'unregistered', 'owner', 'unbound'] as const)('fails closed: %s', async mode => {
    const f = await fixture();
    if (mode === 'hash') await writeFile(join(f.root, 'sample.log'), 'private replacement');
    if (mode === 'missing') await rm(join(f.root, 'sample.log'));
    if (mode === 'unregistered') f.request.fileRef = 'elsewhere';
    if (mode === 'owner') f.request.sourceOwner = 'other';
    const ctx = mode === 'unbound' ? { signal: f.ctx.signal, timeBudgetMs: 10_000 } : f.ctx;
    expect(await f.port.getWindow(f.request, ctx)).toEqual(mode === 'unbound' ? { status: 'unsupported', reason: 'capability_missing' } : { status: 'source_absent' });
  });
  it.each(['../outside', '/etc/passwd', 'file:///etc/passwd', 'https://example.invalid', 'escape.log'])('refuses unsafe directory identifiers: %s', async fileRef => {
    const f = await fixture();
    await symlink('/etc/passwd', join(f.root, 'escape.log'));
    f.request.fileRef = fileRef; f.sampleSet.files[0] = { fileRef, order: 1, sha256: 'a'.repeat(64) };
    expect(await f.port.getWindow(f.request, f.ctx)).toEqual({ status: 'source_absent' });
  });
  it('bounds a giant line and a 200-row window without buffering the file', async () => {
    const f = await fixture('x'.repeat(16 * 1024 * 1024) + '\n' + 'short\n'.repeat(450));
    expect(await f.port.getWindow({ ...f.request, line: 1, before: 0, after: 1 }, f.ctx)).toMatchObject({ status: 'ok', truncated: true, rows: [{ text: 'x'.repeat(8000), truncated: true }, { text: 'short', truncated: false }] });
    const answer = await f.port.getWindow({ ...f.request, line: 200, before: 100, after: 99 }, f.ctx);
    expect(answer.status === 'ok' && answer.rows.length).toBe(200);
    await expect(f.port.getWindow({ ...f.request, before: 100, after: 100 }, f.ctx)).rejects.toMatchObject({ code: 'invalid_request' });
  });
  it('honours cancellation and masks provider error bodies', async () => {
    const f = await fixture(); const ctl = new AbortController(); ctl.abort();
    await expect(f.port.getWindow(f.request, { ...f.ctx, signal: ctl.signal })).rejects.toMatchObject({ code: 'aborted' });
    const failing = createProviderSourceReadPort({ open: async () => { throw new Error('secret body and internal path'); } });
    await expect(failing.getWindow(f.request, f.ctx)).rejects.toMatchObject({ message: 'adapter_failed' });
  });
  it('advertises only window and answers unsupported honestly', async () => {
    const f = await fixture();
    expect(await f.port.describe({ sourceOwner: 'fixture' }, f.ctx)).toMatchObject({ status: 'ok', capabilities: ['getWindow'], synthetic: false });
    expect(await f.port.searchRecords({ sampleSet: f.sampleSet, query: {}, cursor: null, limit: 1 }, f.ctx)).toEqual({ status: 'unsupported', reason: 'capability_missing' });
    expect(await f.port.getParsed({ sourceOwner: f.request.sourceOwner, fileRef: f.request.fileRef, line: f.request.line }, f.ctx)).toEqual({ status: 'unsupported', reason: 'parser_not_connected' });
  });
});
