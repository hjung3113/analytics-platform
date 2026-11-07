#!/usr/bin/env node
// 합성 fixture — synthetic validation catalog reporter (#1491, docs/design/features/log-rules/README.md §4).
// Posts a small FIXED catalog to POST /api/v1/validation-catalog/report with a service token, for integration tests and
// dev seeding. It is NOT evidence of an integration with the in-house Validator: every label says «합성 fixture», and the
// spellings of rule keys are made up. It never runs in the production assembly (the API image copies none of tooling/)
// and it refuses a production-flagged base URL.
//
//   LOG_RULES_REPORT_TOKEN=ap_… node tooling/scripts/log-rules-synthetic-reporter.mjs --base-url http://127.0.0.1:3000
//   node tooling/scripts/log-rules-synthetic-reporter.mjs --dry-run        # print the report, send nothing
//
// The token comes from the environment only (never argv, never printed). The service token needs the scope
// `validation.catalog.report` and its system Actor needs the grant of the same capability.

import { fileURLToPath } from 'node:url';

export const SYNTHETIC_SOURCE = '합성 fixture validator';
export const TOKEN_ENV = 'LOG_RULES_REPORT_TOKEN';
const REPORT_PATH = '/api/v1/validation-catalog/report';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
// A host label (or a `NODE_ENV`-style flag) that names production.
const PRODUCTION_HOST = /(^|[.-])(prod|production|prd|live)([.-]|$)/i;

/** Throws when the base URL may be a production system. Loopback is always allowed; anything else needs `allowRemote`. */
export function assertSafeBaseUrl(baseUrl, { env = process.env, allowRemote = false } = {}) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`합성 fixture reporter: invalid base URL ${JSON.stringify(baseUrl)}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('합성 fixture reporter: base URL must be http or https');
  const flagged = [env.NODE_ENV, env.APP_ENV, env.PLATFORM_ENV, env.DEPLOY_ENV].some((v) => typeof v === 'string' && /^(prod|production)$/i.test(v.trim()));
  if (flagged) throw new Error('합성 fixture reporter: refusing to run in an environment flagged as production');
  if (PRODUCTION_HOST.test(url.hostname)) throw new Error(`합성 fixture reporter: refusing production-looking host ${url.hostname}`);
  if (!LOOPBACK.has(url.hostname) && !allowRemote) {
    throw new Error(`합성 fixture reporter: ${url.hostname} is not a loopback host; pass --allow-remote for a non-production test deployment`);
  }
  return url;
}

const label = (text) => `합성 fixture · ${text}`;

/** The fixed catalog: 2 RuleSets, one retired Revision, an `unknown` support, targets with requirement ids. */
export function buildSyntheticReport() {
  return {
    sourceSystem: SYNTHETIC_SOURCE,
    validatorVersion: 'synthetic-0',
    ruleSets: [
      {
        ruleSetKey: 'synthetic-core',
        revision: 'r2',
        resultRef: 'synthetic-core@r2',
        status: 'active',
        supersedes: 'r1',
        rules: [
          {
            ruleKey: 'synthetic.required-fields',
            title: label('필수 필드'),
            summary: label('필수 필드가 있는지 확인한다고 선언한 가짜 규칙'),
            support: 'supported',
            scope: { logTypes: ['synthetic-log'], inputFormats: ['csv'] },
            requiredDefault: true,
            targets: [
              { format: 'synthetic-xpath', target: label('//Event[@id]'), requirementIds: ['synthetic-module/synthetic-event'] },
              { format: 'synthetic-free-text', target: label('자유 형식 선언 그대로') },
            ],
          },
          {
            ruleKey: 'synthetic.ordering',
            title: label('순서'),
            summary: label('일부 범위만 지원하는 가짜 규칙'),
            support: 'partial',
            targets: [{ format: 'synthetic-xpath', target: label('//Event/@seq'), requirementIds: ['synthetic-module'] }],
          },
        ],
      },
      {
        ruleSetKey: 'synthetic-core',
        revision: 'r1',
        status: 'retired',
        rules: [
          {
            ruleKey: 'synthetic.required-fields',
            title: label('필수 필드(이전 Revision)'),
            summary: label('폐기된 Revision의 가짜 규칙'),
            support: 'unsupported',
          },
        ],
      },
      {
        ruleSetKey: 'synthetic-extra',
        revision: 'v1',
        status: 'active',
        rules: [
          {
            ruleKey: 'synthetic.unreported-support',
            title: label('지원 여부 미보고'),
            summary: label('Validator가 지원 여부를 알려 주지 않은 가짜 규칙'),
            support: 'unknown',
            targets: [{ format: 'synthetic-xpath', target: label('//Other'), requirementIds: ['synthetic-module/not-in-any-spec'] }],
          },
        ],
      },
    ],
  };
}

export async function run(argv, env = process.env, fetchImpl = fetch) {
  const flag = (name) => argv.includes(name);
  const valueOf = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const report = buildSyntheticReport();
  if (flag('--dry-run')) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  const baseUrl = valueOf('--base-url');
  if (!baseUrl) throw new Error('합성 fixture reporter: --base-url is required (or use --dry-run)');
  const url = assertSafeBaseUrl(baseUrl, { env, allowRemote: flag('--allow-remote') });
  const token = env[TOKEN_ENV];
  if (!token) throw new Error(`합성 fixture reporter: set ${TOKEN_ENV}`);
  const res = await fetchImpl(new URL(REPORT_PATH, url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(report),
  });
  const text = await res.text();
  console.log(`합성 fixture report → HTTP ${res.status} ${text}`);
  return res.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
