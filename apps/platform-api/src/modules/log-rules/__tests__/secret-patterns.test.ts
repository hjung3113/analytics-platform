import { describe, expect, it } from 'vitest';

import { generateToken } from '../../api-tokens/token-format.js';
import { findSecretPattern, hasControlCharacter } from '../domain/secret-patterns.js';

describe('findSecretPattern', () => {
  it.each([
    ['an API token of this platform inside text', `see ${generateToken().value} for details`, 'api_token'],
    ['a PEM private key header', '-----BEGIN RSA PRIVATE KEY-----', 'private_key'],
    ['a bare PEM private key header', '-----BEGIN PRIVATE KEY-----', 'private_key'],
    ['an AWS access key id', 'key AKIAIOSFODNN7EXAMPLE here', 'aws_access_key'],
    ['a Bearer value', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345', 'bearer'],
    ['password =', 'password = hunter2', 'assignment'],
    ['secret:', 'the secret: abc', 'assignment'],
    ['token=', 'token=xyz', 'assignment'],
    ['api_key:', 'api_key: k', 'assignment'],
    ['api-key =', 'API-KEY = k', 'assignment'],
    ['a quoted assignment', '"password": "x"', 'assignment'],
  ])('refuses %s', (_name, text, name) => {
    expect(findSecretPattern(text)).toBe(name);
  });

  it.each([
    'Checks that the model id is present',
    'Bearer is a word',
    'Bearer short',
    'token expiry is checked',
    'password policy',
    'ap_abcd1234_short',
    'AKIA lowercase',
    'BEGIN PRIVATE KEY without dashes',
  ])('allows %j', (text) => {
    expect(findSecretPattern(text)).toBeNull();
  });
});

describe('hasControlCharacter', () => {
  it.each(['a\u0000b', 'a\tb', 'a\nb', 'a\rb', 'a\u007fb', 'a\u0085b'])('detects %j', (t) => {
    expect(hasControlCharacter(t)).toBe(true);
  });
  it.each(['plain', '한글 제목', 'emoji 🙂', 'a b'])('allows %j', (t) => {
    expect(hasControlCharacter(t)).toBe(false);
  });
});
