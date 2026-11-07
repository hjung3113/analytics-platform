// Leak boundary (ADR-0119 §1): nothing in the module logs, audits or throws raw source text. Error types carry codes only.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SOURCE_READ_ERROR_CODES, SourceReadError, toSourceReadError } from '../errors.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('leak boundary', () => {
  it('a SourceReadError is its code and nothing else', () => {
    for (const code of SOURCE_READ_ERROR_CODES) {
      const e = new SourceReadError(code);
      expect(e.message).toBe(code);
      expect(Object.keys(e).sort()).toEqual(['code', 'name']);
      expect(e.cause).toBeUndefined();
    }
  });
  it('any other error becomes adapter_failed and loses its text and cause', () => {
    const original = new Error('raw body: secret', { cause: new Error('more secret') });
    const e = toSourceReadError(original);
    expect(e.code).toBe('adapter_failed');
    expect(JSON.stringify(e) + e.message + String(e.cause)).not.toContain('secret');
  });
  it('a SourceReadError an adapter dressed up with a body is rebuilt code-only', () => {
    const BODY = 'raw source body: password=hunter2';
    const dressed = new SourceReadError('aborted') as SourceReadError & Record<string, unknown>;
    dressed.message = BODY;
    dressed.cause = new Error(BODY);
    dressed.stack = BODY;
    dressed.extra = BODY;
    dressed.detail = { line: BODY };
    const e = toSourceReadError(dressed);
    expect(e).not.toBe(dressed);
    expect(e).toBeInstanceOf(SourceReadError);
    expect(e.code).toBe('aborted');
    expect(e.message).toBe('aborted');
    expect(e.cause).toBeUndefined();
    expect(Object.keys(e).sort()).toEqual(['code', 'name']);
    expect(JSON.stringify(e) + e.message + String(e.stack)).not.toContain('hunter2');
  });
  it('an unknown or unreadable code becomes adapter_failed', () => {
    const forged = new SourceReadError('aborted') as unknown as { code: unknown };
    forged.code = 'secret code with a body';
    expect(toSourceReadError(forged).code).toBe('adapter_failed');
    const throwing = new SourceReadError('aborted');
    Object.defineProperty(throwing, 'code', { get() { throw new Error('body'); } });
    expect(toSourceReadError(throwing).code).toBe('adapter_failed');
  });
  // `read-service.ts` is the one audit writer (#1469): it records counts, the Source owner, a digest, filter KEYS and a result code only;
  // `read-endpoints.test.ts` pins that the written row holds no body, no filter value and no file reference. `export-service.ts` (#1472) is the
  // second writer, for `explorer.export`; `export.test.ts` pins its rows the same way.
  it('module source has no console/logger use, and no audit write outside read-service.ts and export-service.ts', () => {
    const offenders: string[] = [];
    for (const file of sources(ROOT)) {
      const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const rel = relative(ROOT, file);
      if (/\bconsole\s*\./.test(text) || /\b(?:logger|log|request\.log|app\.log)\s*\.(?:info|warn|error|debug|trace)\b/.test(text)) offenders.push(`${rel}: logging`);
      if (rel !== 'read-service.ts' && rel !== 'export-service.ts' && /\baudit\.record\b|\bauditLog\b/.test(text)) offenders.push(`${rel}: audit write`);
    }
    expect(offenders).toEqual([]);
  });
  // design §4.1 «LLM·검색 색인»: this slice never sends Source text to an LLM, a search index or a notification. The module imports none of them.
  it('has no import path to an LLM, an embedding, a search index or a notification', () => {
    const offenders: string[] = [];
    for (const file of sources(ROOT)) {
      const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
        if (/llm|embedding|openai|anthropic|voyage|notif|search-index|opensearch|elastic|pgvector|similarity/i.test(match[1] ?? '')) offenders.push(`${relative(ROOT, file)}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
