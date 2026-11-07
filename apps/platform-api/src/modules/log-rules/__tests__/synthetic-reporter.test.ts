// The 합성 fixture reporter (tooling/scripts/log-rules-synthetic-reporter.mjs, #1491): its fixed catalog is a valid
// report, it refuses production, and the production assembly contains none of it. DB-free.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { judgeReport } from '../domain/report.js';

const ROOT = path.resolve(__dirname, '../../../../../..');
const SCRIPT = path.join(ROOT, 'tooling/scripts/log-rules-synthetic-reporter.mjs');

interface Reporter {
  TOKEN_ENV: string;
  assertSafeBaseUrl(url: string, opts: { env?: Record<string, string>; allowRemote?: boolean }): URL;
  buildSyntheticReport(): { sourceSystem: string; ruleSets: { ruleSetKey: string; status: string; rules: { title: string; summary: string; support: string; targets?: { requirementIds?: string[] }[] }[] }[] };
  run(argv: string[], env: Record<string, string>, fetchImpl: typeof fetch): Promise<number>;
}
const load = (): Promise<Reporter> => import(/* @vite-ignore */ pathToFileURL(SCRIPT).href) as Promise<Reporter>;

describe('synthetic catalog reporter', () => {
  it('posts a fixed catalog the boundary accepts: ≥2 RuleSets, a retired Revision, unknown support, requirement ids, all labelled 합성 fixture', async () => {
    const { buildSyntheticReport } = await load();
    const report = buildSyntheticReport();
    const judged = judgeReport(Buffer.from(JSON.stringify(report)));
    expect(judged.ok, JSON.stringify(judged)).toBe(true);
    expect(new Set(report.ruleSets.map((r) => r.ruleSetKey)).size).toBeGreaterThanOrEqual(2);
    expect(report.ruleSets.some((r) => r.status === 'retired')).toBe(true);
    const rules = report.ruleSets.flatMap((r) => r.rules);
    expect(rules.some((r) => r.support === 'unknown')).toBe(true);
    expect(rules.some((r) => (r.targets ?? []).some((t) => (t.requirementIds ?? []).length > 0))).toBe(true);
    expect(report.sourceSystem).toContain('합성 fixture');
    for (const rule of rules) expect(`${rule.title} ${rule.summary}`).toContain('합성 fixture');
  });

  it('allows loopback, refuses production-looking hosts and production-flagged environments', async () => {
    const { assertSafeBaseUrl } = await load();
    expect(() => assertSafeBaseUrl('http://127.0.0.1:3000', { env: {} })).not.toThrow();
    expect(() => assertSafeBaseUrl('https://platform.example.com', { env: {} })).toThrow(/loopback/);
    for (const host of ['https://api.prod.example.com', 'https://platform-production.example.com', 'https://live.example.com']) {
      expect(() => assertSafeBaseUrl(host, { env: {}, allowRemote: true }), host).toThrow(/production/);
    }
    for (const key of ['NODE_ENV', 'APP_ENV', 'PLATFORM_ENV', 'DEPLOY_ENV']) {
      expect(() => assertSafeBaseUrl('http://127.0.0.1:3000', { env: { [key]: 'production' } }), key).toThrow(/production/);
    }
  });

  it('refuses a production base URL before any request, and posts with the bearer token otherwise', async () => {
    const { run, TOKEN_ENV } = await load();
    const seen: { url: string; auth: string }[] = [];
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      seen.push({ url: String(url), auth: (init.headers as Record<string, string>).authorization ?? '' });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await expect(run(['--base-url', 'https://x.prod.example.com', '--allow-remote'], { [TOKEN_ENV]: 't' }, fetchImpl)).rejects.toThrow(/production/);
    expect(seen).toEqual([]);
    expect(await run(['--base-url', 'http://127.0.0.1:3000'], { [TOKEN_ENV]: 'ap_secret' }, fetchImpl)).toBe(0);
    expect(seen).toEqual([{ url: 'http://127.0.0.1:3000/api/v1/validation-catalog/report', auth: 'Bearer ap_secret' }]);
  });

  it('is absent from the production graph: no source file imports it and the API image copies none of tooling/scripts', () => {
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== '__tests__') walk(full);
        } else if (/\.(ts|mjs|js)$/.test(name) && !/\.test\./.test(name)) sources.push(full);
      }
    };
    walk(path.join(ROOT, 'apps/platform-api/src'));
    for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(/synthetic-reporter|log-rules-synthetic/);
    const dockerfile = readFileSync(path.join(ROOT, 'apps/platform-api/Dockerfile'), 'utf8');
    expect(dockerfile).not.toMatch(/tooling\/scripts|synthetic-reporter/);
    for (const compose of ['docker-compose.production.yml', 'docker-compose.release.yml']) {
      expect(readFileSync(path.join(ROOT, 'ops/platform-api', compose), 'utf8'), compose).not.toMatch(/synthetic-reporter/);
    }
  });
});
