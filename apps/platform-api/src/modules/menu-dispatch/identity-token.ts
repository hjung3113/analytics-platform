import { createPrivateKey, sign } from 'node:crypto';

import { CORRELATION_ID_PATTERN } from '../../lib/correlation-id.js';

export interface IdentityTokenClaims {
  sub: string;
  wid: string;
  sv: string;
  cid: string;
  scopes: readonly string[];
  htm: string;
  htu: string;
  aud?: string;
}

export interface IdentityTokenSigner {
  sign(claims: IdentityTokenClaims): string;
}

/** `now` follows Date.now: milliseconds since the Unix epoch. */
export function createIdentityTokenSigner({
  privateKeyPem,
  keyId,
  now = Date.now,
}: {
  privateKeyPem: string;
  keyId: string;
  now?: () => number;
}): IdentityTokenSigner {
  const privateKey = (() => {
    try {
      const key = createPrivateKey(privateKeyPem);
      if (key.asymmetricKeyType === 'ed25519') return key;
    } catch {
      // Never expose key material or parser diagnostics to callers.
    }
    throw new Error('Identity token signing key must be an Ed25519 private key');
  })();
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: keyId })).toString('base64url');

  return {
    sign({ sub, wid, sv, cid, scopes, htm, htu, aud = 'analytics' }) {
      if (typeof sub !== 'string' || sub.length === 0) throw new Error('Identity token sub must be non-empty');
      if (typeof wid !== 'string' || wid.length === 0) throw new Error('Identity token wid must be non-empty');
      if (typeof cid !== 'string' || !CORRELATION_ID_PATTERN.test(cid)) throw new Error('Identity token cid must be a valid correlation id');
      if (typeof htu !== 'string' || !htu.startsWith('/')) throw new Error('Identity token htu must start with /');
      if (!Array.isArray(scopes)) throw new Error('Identity token scopes must be an array of strings');
      for (const scope of scopes) {
        if (typeof scope !== 'string') throw new Error('Identity token scopes must be an array of strings');
      }
      const iat = Math.floor(now() / 1000);
      const payload = Buffer.from(JSON.stringify({ sub, wid, sv, cid, scopes, aud, htm, htu, iat, exp: iat + 30 })).toString('base64url');
      const signingInput = `${header}.${payload}`;
      return `${signingInput}.${sign(null, Buffer.from(signingInput), privateKey).toString('base64url')}`;
    },
  };
}
