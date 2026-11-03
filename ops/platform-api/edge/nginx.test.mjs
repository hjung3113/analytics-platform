// Static check of the production edge config (#1266 b1d). No nginx or Docker is reached.
// Run: node ops/platform-api/edge/nginx.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const conf = readFileSync(fileURLToPath(new URL('nginx.conf', import.meta.url)), 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

// Top-level `location` blocks of the server, in file order: [header, body].
function locations() {
  const found = [];
  const re = /^ {4}location\s+([^{]+?)\s*\{\n([\s\S]*?)^ {4}\}/gm;
  for (let m = re.exec(conf); m; m = re.exec(conf)) found.push([m[1].trim(), m[2]]);
  return found;
}

test('edge: routes are declared in the decided order', () => {
  assert.deepEqual(
    locations().map(([header]) => header),
    ['^~ /api/features/', '^~ /api/', '^~ /auth/', '^~ /assets/', '= /index.html', '/'],
  );
});

test('edge: /api/features/ is stripped, /api/ and /auth/ are forwarded unchanged', () => {
  const byHeader = Object.fromEntries(locations());
  assert.match(byHeader['^~ /api/features/'], /rewrite \^\/api\/features\/\(\.\*\)\$ \/\$1 break;/);
  assert.match(byHeader['^~ /api/features/'], /proxy_pass http:\/\/\$backend_upstream;/);
  for (const header of ['^~ /api/', '^~ /auth/']) {
    assert.match(byHeader[header], /proxy_pass http:\/\/\$backend_upstream;/, header);
    assert.doesNotMatch(byHeader[header], /rewrite/, header);
  }
  assert.match(conf, /set \$backend_upstream backend:3001;/);
});

test('edge: no error interception or SPA fallback on proxied locations', () => {
  assert.doesNotMatch(conf, /proxy_intercept_errors\s+on/);
  assert.doesNotMatch(conf, /\berror_page\b/);
  for (const [header, body] of locations().filter(([, b]) => b.includes('proxy_pass'))) {
    assert.doesNotMatch(body, /try_files|index\.html|error_page|proxy_intercept_errors/, header);
  }
});

test('edge: SPA fallback and cache headers', () => {
  const byHeader = Object.fromEntries(locations());
  assert.match(byHeader['/'], /try_files \$uri \/index\.html;/);
  assert.match(byHeader['= /index.html'], /Cache-Control "no-cache"/);
  assert.match(byHeader['^~ /assets/'], /try_files \$uri =404;/);
  assert.match(byHeader['^~ /assets/'], /immutable/);
});

test('edge: forwarded headers, body limit and timeouts', () => {
  assert.match(conf, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  assert.match(conf, /proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;/);
  assert.doesNotMatch(conf, /X-Forwarded-Proto \$scheme/);
  assert.match(conf, /proxy_set_header Host \$http_host;/);
  assert.doesNotMatch(conf, /proxy_set_header (Cookie|X-Correlation-Id)\b/);
  assert.match(conf, /client_max_body_size 26m;/);
  for (const name of ['proxy_read_timeout', 'proxy_send_timeout']) {
    const seconds = Number(conf.match(new RegExp(`${name} (\\d+)s;`))?.[1]);
    assert.ok(seconds >= 60, name);
  }
});
