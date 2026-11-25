import { afterEach, describe, expect, it } from 'vitest';

import { EMBEDDING_PROVIDER_REACH, EMBEDDING_PROVIDERS, loadConfig } from '../config.js';

// ADR-0150: an in-house install never calls an external AI or embedding provider; the core server refuses to start.
const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

function withEmbedding(provider: string, inHouse: string | undefined) {
  process.env.EMBEDDING_PROVIDER = provider;
  process.env.EMBEDDING_API_KEY = 'test-only-key';
  if (inHouse === undefined) delete process.env.PLATFORM_IN_HOUSE;
  else process.env.PLATFORM_IN_HOUSE = inHouse;
}

describe('in-house install refuses external AI providers (ADR-0150)', () => {
  it('defaults to not in-house', () => {
    delete process.env.PLATFORM_IN_HOUSE;
    expect(loadConfig().PLATFORM_IN_HOUSE).toBe(false);
  });

  it('refuses to start in-house with an external embedding provider, naming the setting and the rule', () => {
    withEmbedding('voyage', 'true');
    expect(() => loadConfig()).toThrow(/EMBEDDING_PROVIDER=voyage.*PLATFORM_IN_HOUSE=true.*ADR-0150/s);
  });

  it.each(['disabled', 'fake'])('starts in-house with the local provider %s', (provider) => {
    withEmbedding(provider, 'true');
    expect(loadConfig().EMBEDDING_PROVIDER).toBe(provider);
  });

  it('starts outside an in-house install with an external provider (development and tests)', () => {
    withEmbedding('voyage', 'false');
    expect(loadConfig().EMBEDDING_PROVIDER).toBe('voyage');
  });

  it('rejects a flag value other than true or false', () => {
    withEmbedding('disabled', 'yes');
    expect(() => loadConfig()).toThrow(/PLATFORM_IN_HOUSE/);
  });

  it('classifies every embedding provider as external or local, so a new provider cannot skip the check', () => {
    delete process.env.PLATFORM_IN_HOUSE;
    expect(Object.keys(EMBEDDING_PROVIDER_REACH).sort()).toEqual([...EMBEDDING_PROVIDERS].sort());
    expect(EMBEDDING_PROVIDER_REACH.voyage).toBe('external');
  });
});
