import { generateKeyPairSync } from 'node:crypto';
import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';

import { createIdentityTokenSigner } from '../identity-token.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const currentDate = new Date('2026-11-12T00:00:00.999Z');
const claims = {
  sub: '9c457339-7046-4623-9b23-602b1af03097',
  wid: '0857c716-d4ab-48cf-9b80-880592801a1c',
  sv: 'session-version-7',
  cid: 'req.123_test-1',
  scopes: ['site-a/room-1', 'site-a/room-2'],
  htm: 'POST',
  htu: '/internal/menu-query/equipment.rows',
};
const options = { privateKeyPem, keyId: 'identity-2026', now: () => currentDate.getTime() };

// The agreed seam is signer creation/sign; jose independently verifies the wire token.
describe('internal identity token signer', () => {
  it('signs every identity/request claim with Ed25519 and the selected kid', async () => {
    const token = createIdentityTokenSigner(options).sign(claims);
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, { currentDate });
    expect(protectedHeader).toEqual({ alg: 'EdDSA', typ: 'JWT', kid: 'identity-2026' });
    expect(payload).toEqual({ ...claims, aud: 'analytics', iat: 1794441600, exp: 1794441630 });
  });
});

describe('identity token verification', () => {
  it('sets the analytics audience', async () => {
    const { payload } = await jwtVerify(createIdentityTokenSigner(options).sign(claims), publicKey, { currentDate });
    expect(payload.aud).toBe('analytics');
  });

  it('expires exactly 30 seconds after issuance', async () => {
    const { payload } = await jwtVerify(createIdentityTokenSigner(options).sign(claims), publicKey, { currentDate });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(30);
  });

  it('accepts an empty resolved Scope set', async () => {
    const token = createIdentityTokenSigner(options).sign({ ...claims, scopes: [] });
    const { payload } = await jwtVerify(token, publicKey, { currentDate });
    expect(payload.scopes).toEqual([]);
  });

  it('issues a fresh token for each request using the default clock', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = createIdentityTokenSigner({ privateKeyPem, keyId: 'current' }).sign(claims);
    const { payload } = await jwtVerify(token, publicKey, { audience: 'analytics' });
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('rejects a tampered payload', async () => {
    const token = createIdentityTokenSigner(options).sign(claims);
    const [header, , signature] = token.split('.');
    const tampered = Buffer.from(JSON.stringify({ ...claims, sub: 'attacker' })).toString('base64url');
    await expect(jwtVerify(`${header}.${tampered}.${signature}`, publicKey, { currentDate }))
      .rejects.toThrow('signature verification failed');
  });

  it('rejects a signature made with another key', async () => {
    const wrongKey = generateKeyPairSync('ed25519').publicKey;
    await expect(jwtVerify(createIdentityTokenSigner(options).sign(claims), wrongKey, { currentDate }))
      .rejects.toThrow('signature verification failed');
  });
});

describe('identity token input validation', () => {
  it('rejects a non-Ed25519 private key at creation', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    const otherPem = other.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => createIdentityTokenSigner({ ...options, privateKeyPem: otherPem })).toThrow('Ed25519');
  });

  it('reports malformed key material without including it in the error', () => {
    expect(() => createIdentityTokenSigner({ ...options, privateKeyPem: 'private-secret-invalid-pem' }))
      .toThrow(/^Identity token signing key must be an Ed25519 private key$/);
  });

  it.each([
    ['empty actor', { sub: '' }],
    ['empty workspace', { wid: '' }],
    ['empty correlation id', { cid: '' }],
    ['unsafe correlation id', { cid: 'bad\r\nid' }],
    ['overlong correlation id', { cid: 'a'.repeat(129) }],
    ['relative upstream path', { htu: 'internal/menu-query' }],
    ['empty upstream path', { htu: '' }],
    ['absolute upstream URL', { htu: 'https://upstream.example/query' }],
    ['non-string Scope', { scopes: ['site-a', 123] }],
    ['non-array Scopes', { scopes: 'site-a' }],
    ['missing Scopes', { scopes: undefined }],
    ['sparse Scopes', { scopes: Array<string>(1) }],
  ])('refuses %s', (_name, override) => {
    const invalid = { ...claims, ...override } as unknown as Parameters<ReturnType<typeof createIdentityTokenSigner>['sign']>[0];
    expect(() => createIdentityTokenSigner(options).sign(invalid)).toThrow();
  });
});
