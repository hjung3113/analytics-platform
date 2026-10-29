import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { OIDC_TX_COOKIE_NAME, type OidcTxPayload, signOidcTx, verifyOidcTx } from '../oidc-tx-cookie.js';

const SECRET = 'unit-test-client-secret';
const PAYLOAD: OidcTxPayload = {
  state: 's',
  nonce: 'n',
  verifier: 'v',
  returnTo: '/',
  exp: 4_102_444_800,
};

// Same wire format and algorithm as signOidcTx, parameterized by the key label,
// so a cookie minted under the retired label is a faithful old-format value.
function signWithLabel(label: string, payload: OidcTxPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = createHmac('sha256', SECRET).update(label).digest();
  const sig = createHmac('sha256', key).update(`oidc-tx-v1.${payloadB64}`).digest('base64url');
  return `${payloadB64}.${sig}`;
}

describe('OIDC transaction cookie naming', () => {
  it('uses the platform cookie name literal', () => {
    expect(OIDC_TX_COOKIE_NAME).toBe('platform_oidc_tx');
  });

  it('accepts a cookie signed under the platform label', () => {
    expect(verifyOidcTx(SECRET, signWithLabel('platform-oidc-tx-v1', PAYLOAD))).toEqual(PAYLOAD);
    expect(verifyOidcTx(SECRET, signOidcTx(SECRET, PAYLOAD))).toEqual(PAYLOAD);
  });

  it('rejects a cookie signed under the retired label (no signature alias)', () => {
    expect(verifyOidcTx(SECRET, signWithLabel('fops-oidc-tx-v1', PAYLOAD))).toBeNull();
  });
});
