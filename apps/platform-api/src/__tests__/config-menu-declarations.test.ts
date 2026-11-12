// Menu declaration/forwarder/resolver env validation (issue #1729 node b).
//
// Contracts (ADR-0146/0147/0148, ADR-0095 §2): all MENU_* keys are optional.
// Setting MENU_DECLARATIONS_FILE makes the upstream base URL and the identity
// signing key file required. The grant-service URL stays optional (absent =
// no resolver, requiresScope endpoints stay refused). URLs must be http(s).
// MENU_UPSTREAM_TIMEOUT_MS must stay below HTTP_REQUEST_TIMEOUT_MS (budget:
// adapter 30 s > upstream call 27 s > upstream judgment 25 s). Messages
// never echo values. Pure unit tests: no DB, no network, no file reads.

import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { loadConfig } from '../config.js';


const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

interface ParsedIssue {
  path: string;
  message: string;
}

// Mimics loadConfig() with a hermetic process.env clone. Returns the MENU_*
// issues (empty = config accepted); issues outside the MENU_* surface are
// surfaced as an error so positive cases cannot pass for the wrong reason.
function menuIssues(env: Record<string, string | undefined>): ParsedIssue[] | undefined {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  try {
    loadConfig();
    return [];
  } catch (err) {
    if (!(err instanceof ZodError)) return undefined;
    const parsed = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    if (parsed.some((issue) => !issue.path.startsWith('MENU_'))) return undefined;
    return parsed;
  }
}

function menuEnv(
  overrides: Partial<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    MENU_DECLARATIONS_FILE: '/app/menu-declarations.json',
    MENU_UPSTREAM_BASE_URL: 'https://upstream.example.com',
    MENU_IDENTITY_KEY_FILE: '/app/keys/identity.pem',
    MENU_IDENTITY_KEY_ID: '2026-11',
    MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.example.com',
    ...overrides,
  };
  // process.env coerces `undefined` assignments to the string "undefined";
  // an explicit undefined override means "unset", so drop the key.
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return env;
}

describe('menu declaration/forwarder/resolver config via loadConfig', () => {
  it('accepts a fully valid configuration', () => {
    expect(menuIssues(menuEnv())).toEqual([]);
  });

  it('accepts an entirely absent MENU_* surface (existing behaviour unchanged)', () => {
    expect(menuIssues({})).toEqual([]);
  });

  it('accepts declarations without a grant-service URL (no resolver)', () => {
    expect(menuIssues(menuEnv({ MENU_SCOPE_GRANT_SERVICE_URL: undefined }))).toEqual([]);
  });

  it.each(['MENU_UPSTREAM_BASE_URL', 'MENU_IDENTITY_KEY_FILE'])(
    'declarations file without %s → one issue naming exactly that variable',
    (variable) => {
      const issues = menuIssues(menuEnv({ [variable]: undefined })) ?? [];
      expect(issues).toEqual([
        {
          path: variable,
          message: `${variable} is required when MENU_DECLARATIONS_FILE is set`,
        },
      ]);
    },
  );

  it.each([
    ['ftp://upstream.example.com', 'non-http(s) scheme'],
    ['upstream.example.com', 'no scheme'],
    ['https://user:pass@upstream.example.com', 'credentials'],
    ['https://upstream.example.com/path?x=1', 'path and query'],
  ])('rejects upstream base URL %s (%s) without echoing it', (url) => {
    const issues = menuIssues(menuEnv({ MENU_UPSTREAM_BASE_URL: url })) ?? [];
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('MENU_UPSTREAM_BASE_URL');
    expect(issues[0]?.message).not.toContain(url);
  });

  it.each([
    ['ftp://grants.example.com', 'non-http(s) scheme'],
    ['grants.example.com', 'no scheme'],
  ])('rejects grant-service URL %s (%s) without echoing it', (url) => {
    const issues = menuIssues(menuEnv({ MENU_SCOPE_GRANT_SERVICE_URL: url })) ?? [];
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('MENU_SCOPE_GRANT_SERVICE_URL');
    expect(issues[0]?.message).not.toContain(url);
  });

  it('allows plain http URLs (local upstream/grant services)', () => {
    expect(
      menuIssues(
        menuEnv({
          MENU_UPSTREAM_BASE_URL: 'http://localhost:9099',
          MENU_SCOPE_GRANT_SERVICE_URL: 'http://localhost:9098',
        }),
      ),
    ).toEqual([]);
  });

  it('defaults resolver and upstream timeouts when unset', () => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MENU_')) delete process.env[key];
    }
    const config = loadConfig();
    expect(config.MENU_RESOLVER_TIMEOUT_MS).toBe(3_000);
    expect(config.MENU_UPSTREAM_TIMEOUT_MS).toBe(27_000);
  });

  it('rejects upstream timeout >= HTTP_REQUEST_TIMEOUT_MS (ADR-0095 §2 budget)', () => {
    const issues =
      menuIssues(menuEnv({ MENU_UPSTREAM_TIMEOUT_MS: '30000', HTTP_REQUEST_TIMEOUT_MS: '30000' })) ??
      [];
    expect(issues).toEqual([
      {
        path: 'MENU_UPSTREAM_TIMEOUT_MS',
        message: 'MENU_UPSTREAM_TIMEOUT_MS must be lower than HTTP_REQUEST_TIMEOUT_MS',
      },
    ]);
  });

  it('accepts upstream timeout below HTTP_REQUEST_TIMEOUT_MS', () => {
    expect(
      menuIssues(menuEnv({ MENU_UPSTREAM_TIMEOUT_MS: '27000', HTTP_REQUEST_TIMEOUT_MS: '30000' })),
    ).toEqual([]);
  });

  it('rejects blank declarations companions without echoing them', () => {
    const issues =
      menuIssues(menuEnv({ MENU_UPSTREAM_BASE_URL: '', MENU_IDENTITY_KEY_FILE: '' })) ?? [];
    expect(issues.map((issue) => issue.path).sort()).toEqual([
      'MENU_IDENTITY_KEY_FILE',
      'MENU_UPSTREAM_BASE_URL',
    ]);
  });
});
