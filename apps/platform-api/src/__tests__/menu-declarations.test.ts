// #1729 h — the production menu-declaration assembly (`src/menu-declarations.ts`), DB-free:
// unset `MENU_DECLARATIONS_FILE` builds nothing (the server starts exactly as before), a missing or
// non-Ed25519 key file and an invalid bundle fail closed, and the valid case returns the declared
// contribution plus the grant-service resolver, forwarding through the injected `fetch` seam.
// No thrown message may carry key material.

import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMenuDeclarationSetup, type MenuDeclarationConfig } from '../menu-declarations.js';
import type { CheckService } from '../modules/permissions/check-service.js';

const bundle = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    endpoints: [
      {
        id: 'synthetic.rows',
        menuId: 'synthetic',
        paramKeys: ['q'],
        permission: 'synthetic:view',
        requiresScope: false,
        context: {},
        mergeTimeDomain: false,
      },
    ],
    actions: [],
    permissions: [{ permission: 'synthetic:view', capability: 'workspace.read' }],
    endpointOwners: { 'synthetic.rows': '/upstream/synthetic/rows' },
    ...over,
  });

const config = (over: Partial<MenuDeclarationConfig> = {}): MenuDeclarationConfig => ({
  MENU_DECLARATIONS_FILE: undefined,
  MENU_UPSTREAM_BASE_URL: undefined,
  MENU_IDENTITY_KEY_FILE: undefined,
  MENU_IDENTITY_KEY_ID: undefined,
  MENU_SCOPE_GRANT_SERVICE_URL: undefined,
  MENU_RESOLVER_TIMEOUT_MS: 3_000,
  MENU_UPSTREAM_TIMEOUT_MS: 27_000,
  ...over,
});

// declaredContribution keeps the service for the per-request `authorize` closure only; this suite never calls it.
const checkService = {} as unknown as CheckService;
const failFetch = async () => {
  throw new Error('fetch must not be called in this test');
};

let dir: string;
let bundleFile: string;
let badBundleFile: string;
let keyFile: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'menu-declarations-'));
  bundleFile = join(dir, 'bundle.json');
  badBundleFile = join(dir, 'bad-bundle.json');
  keyFile = join(dir, 'identity.key');
  const { privateKey } = generateKeyPairSync('ed25519');
  await Promise.all([
    writeFile(bundleFile, bundle()),
    writeFile(badBundleFile, '{ not json'),
    writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' })),
  ]);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadMenuDeclarationSetup (#1729 h)', () => {
  it('returns nothing when MENU_DECLARATIONS_FILE is unset', async () => {
    await expect(loadMenuDeclarationSetup(config(), { checkService })).resolves.toBeNull();
  });

  it('fails closed on a missing identity key file, without key material', async () => {
    const setup = loadMenuDeclarationSetup(
      config({
        MENU_DECLARATIONS_FILE: bundleFile,
        MENU_UPSTREAM_BASE_URL: 'https://upstream.test',
        MENU_IDENTITY_KEY_FILE: join(dir, 'absent.key'),
        MENU_IDENTITY_KEY_ID: 'k1',
      }),
      { checkService },
    );
    await expect(setup).rejects.toThrow(/identity key file/i);
    await expect(setup).rejects.not.toThrow(/PRIVATE KEY/);
  });

  it('fails closed on a key that is not an Ed25519 private key', async () => {
    const notEd25519 = join(dir, 'not-ed25519.key');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await writeFile(notEd25519, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    await expect(
      loadMenuDeclarationSetup(
        config({
          MENU_DECLARATIONS_FILE: bundleFile,
          MENU_UPSTREAM_BASE_URL: 'https://upstream.test',
          MENU_IDENTITY_KEY_FILE: notEd25519,
          MENU_IDENTITY_KEY_ID: 'k1',
        }),
        { checkService },
      ),
    ).rejects.toThrow(/Ed25519/);
  });

  it('fails closed on an invalid declaration bundle', async () => {
    await expect(
      loadMenuDeclarationSetup(
        config({
          MENU_DECLARATIONS_FILE: badBundleFile,
          MENU_UPSTREAM_BASE_URL: 'https://upstream.test',
          MENU_IDENTITY_KEY_FILE: keyFile,
          MENU_IDENTITY_KEY_ID: 'k1',
        }),
        { checkService },
      ),
    ).rejects.toThrow(/declaration bundle/);
  });

  it.each([
    'https://upstream.test ',
    'https://upstream.test#',
    'https://upstream.test?',
    'https://upstream.test?debug=1',
    'ftp://upstream.test',
    'https://user:pass@upstream.test',
  ])('refuses invalid MENU_UPSTREAM_BASE_URL at startup: %s', async (baseUrl) => {
    await expect(loadMenuDeclarationSetup(config({
      MENU_DECLARATIONS_FILE: bundleFile,
      MENU_UPSTREAM_BASE_URL: baseUrl,
      MENU_IDENTITY_KEY_FILE: keyFile,
      MENU_IDENTITY_KEY_ID: 'k1',
    }), { checkService })).rejects.toThrow(/MENU_UPSTREAM_BASE_URL/);
  });

  it('refuses an owner query at startup and names the endpoint field', async () => {
    const invalidOwners = join(dir, 'invalid-owners.json');
    await writeFile(invalidOwners, bundle({ endpointOwners: { 'synthetic.rows': '/upstream/rows?debug=1' } }));
    await expect(loadMenuDeclarationSetup(config({
      MENU_DECLARATIONS_FILE: invalidOwners,
      MENU_UPSTREAM_BASE_URL: 'https://upstream.test',
      MENU_IDENTITY_KEY_FILE: keyFile,
      MENU_IDENTITY_KEY_ID: 'k1',
    }), { checkService })).rejects.toThrow(/endpointOwners.*synthetic.rows/);
  });

  it('builds the contribution without a resolver when no grant service is configured', async () => {
    const setup = await loadMenuDeclarationSetup(
      config({
        MENU_DECLARATIONS_FILE: bundleFile,
        MENU_UPSTREAM_BASE_URL: 'https://upstream.test',
        MENU_IDENTITY_KEY_FILE: keyFile,
        MENU_IDENTITY_KEY_ID: 'k1',
      }),
      { checkService, fetch: failFetch as unknown as typeof globalThis.fetch },
    );
    expect(setup).not.toBeNull();
    expect(setup?.scopeResolver).toBeUndefined();
    const endpoints = setup?.menuDispatch.flatMap((c) => [...(c.endpoints ?? [])]) ?? [];
    expect(endpoints.map((e) => e.spec.id)).toEqual(['synthetic.rows']);
    expect(setup?.menuDispatch.flatMap((c) => [...(c.permissions ?? [])].map((p) => p.permission)))
      .toEqual(['synthetic:view']);
  });

  it('builds the grant-service resolver and forwards through the injected fetch with the identity token', async () => {
    const seen: { url: string; token: string | undefined }[] = [];
    const fetchImpl = (async (_input: unknown, init: RequestInit) => {
      const url = String(_input);
      if (url.includes('/scopes/resolve')) {
        return new Response(JSON.stringify([{ site: 'site-a', rooms: ['ETCH'] }]), { status: 200 });
      }
      seen.push({ url, token: init.headers && !(init.headers instanceof Headers) ? (init.headers as Record<string, string>)['x-internal-identity'] : undefined });
      return new Response(
        JSON.stringify({ outcome: 'ok', data: { rows: [] }, assessments: [], trust: null, correlationId: 'cid-1' }),
        { status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;
    const setup = await loadMenuDeclarationSetup(
      config({
        MENU_DECLARATIONS_FILE: bundleFile,
        MENU_UPSTREAM_BASE_URL: 'https://upstream.test/',
        MENU_IDENTITY_KEY_FILE: keyFile,
        MENU_IDENTITY_KEY_ID: 'k1',
        MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test',
      }),
      { checkService, fetch: fetchImpl },
    );
    expect(setup?.scopeResolver).toBeDefined();
    await expect(
      setup?.scopeResolver?.resolve({ actor_id: 'a', workspace_id: 'w' }),
    ).resolves.toEqual([{ site: 'site-a', rooms: ['ETCH'] }]);

    const endpoint = setup?.menuDispatch.flatMap((c) => [...(c.endpoints ?? [])])[0];
    if (!endpoint) throw new Error('declared endpoint missing');
    const result = await endpoint.handle({
      actor: { actor_id: 'actor-1', workspace_id: 'w1', role_level: 'user' },
      scopes: [],
      sessionVersion: async () => 'sv-1',
      context: {},
      params: { q: 'x' },
      correlationId: 'cid-1',
    });
    expect(result).toMatchObject({ outcome: 'ok', data: { rows: [] } });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('https://upstream.test/upstream/synthetic/rows');
    const token = seen[0]?.token;
    expect(typeof token).toBe('string');
    // The header carries the signed identity token (kid, sv) — not key material.
    const [header, payload] = (token as string).split('.');
    expect(JSON.parse(Buffer.from(header as string, 'base64url').toString())).toMatchObject({ kid: 'k1', alg: 'EdDSA' });
    expect(JSON.parse(Buffer.from(payload as string, 'base64url').toString())).toMatchObject({ sub: 'actor-1', wid: 'w1', sv: 'sv-1', htu: '/upstream/synthetic/rows' });
  });
});
