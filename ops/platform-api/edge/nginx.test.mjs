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
    [
      '= /api/v1/platform/files',
      '^~ /api/features/',
      '^~ /api/',
      '^~ /auth/',
      '^~ /assets/',
      '= /index.html',
      '/',
    ],
  );
});

test('edge: only the generic upload route accepts a body above 32 MiB; every other route keeps 26m', () => {
  const byHeader = Object.fromEntries(locations());
  const upload = byHeader['= /api/v1/platform/files'];
  assert.match(upload, /proxy_pass http:\/\/\$backend_upstream;/);
  const limit = Number(upload.match(/client_max_body_size (\d+)m;/)?.[1]);
  // 32 MiB plus multipart overhead, and room for the one-byte-over file to reach the backend's own validation.
  assert.ok(limit > 32, 'upload route allows more than 32 MiB');
  assert.doesNotMatch(upload, /rewrite|try_files/);
  for (const [header, body] of locations()) {
    if (header !== '= /api/v1/platform/files')
      assert.doesNotMatch(body, /client_max_body_size/, header);
  }
  assert.equal([...conf.matchAll(/client_max_body_size 26m;/g)].length, 1);
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
  assert.match(byHeader['^~ /assets/'], /add_header Cache-Control \$asset_cache_control;/);
});

test('edge: long immutable caching only on successful asset responses', () => {
  const map = conf.match(/map \$status \$asset_cache_control \{([\s\S]*?)\n\}/)[1];
  assert.match(map, /default ""/);
  assert.match(map, /^\s*200 "public, max-age=31536000, immutable";/m);
  assert.doesNotMatch(map, /\b(404|4\d\d|5\d\d)\b/);
  // No literal immutable header (which would need `always` to reach a 404) anywhere else.
  assert.doesNotMatch(conf.replace(map, ''), /immutable/);
  assert.doesNotMatch(
    locations().find(([h]) => h === '^~ /assets/')[1],
    /Cache-Control[^\n]*always/,
  );
});

test('edge: access log is path-only and never logs query strings or referrers', () => {
  const format = conf.match(/log_format edge_safe ([\s\S]*?);/)[1];
  assert.match(format, /\$uri\b/);
  assert.match(format, /\$status\b/);
  assert.match(format, /\$body_bytes_sent\b/);
  assert.match(format, /\$request_time\b/);
  assert.match(format, /\$http_x_correlation_id\b/);
  assert.match(format, /\$http_x_forwarded_for\b/);
  assert.match(conf, /access_log \S+ edge_safe;/);
  // Not just the format: nothing in the config may log these, whatever the directive.
  assert.doesNotMatch(conf, /\$request\b(?!_)/);
  assert.doesNotMatch(
    conf,
    /\$args\b|\$query_string\b|\$request_uri\b|\$http_referer\b|\$is_args\b/,
  );
  assert.doesNotMatch(conf, /access_log [^\n]*\b(main|combined)\b/);
  assert.match(conf, /error_log \S+ crit;/);
});

const DOCUMENT_HEADERS = [
  /add_header Content-Security-Policy \$document_csp always;/,
  /add_header X-Content-Type-Options "nosniff" always;/,
  /add_header Referrer-Policy "no-referrer" always;/,
  /add_header X-Frame-Options "SAMEORIGIN" always;/,
];

test('edge: document locations carry the backend Helmet policy, proxied ones add no headers', () => {
  const csp = conf.match(/set \$document_csp "([^"]+)";/)[1];
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: ${PUBLIC_ATTACHMENT_ORIGIN}",
    "font-src 'self' data:",
    "connect-src 'self' ${PUBLIC_ATTACHMENT_ORIGIN}",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ]) {
    assert.ok(csp.split('; ').includes(directive), directive);
  }
  const byHeader = Object.fromEntries(locations());
  for (const header of ['^~ /assets/', '= /index.html', '/']) {
    for (const re of DOCUMENT_HEADERS) assert.match(byHeader[header], re, `${header} ${re}`);
  }
  for (const header of ['^~ /api/features/', '^~ /api/', '^~ /auth/']) {
    assert.doesNotMatch(
      byHeader[header],
      /add_header|proxy_hide_header|proxy_set_header Content-Security/,
      header,
    );
  }
  // Server-level add_header would leak into the proxied locations.
  const serverLevel = conf.replace(/^ {4}location[\s\S]*?^ {4}\}/gm, '');
  assert.doesNotMatch(serverLevel, /add_header/);
});

test('edge: nginx-generated redirects are relative', () => {
  assert.match(conf, /^\s*absolute_redirect off;/m);
  assert.match(conf, /^\s*port_in_redirect off;/m);
});

test('edge image: template renders only PUBLIC_ATTACHMENT_ORIGIN, compose passes it', () => {
  const dockerfile = readFileSync(
    fileURLToPath(new URL('../../../apps/platform-web/Dockerfile', import.meta.url)),
    'utf8',
  );
  assert.match(dockerfile, /edge\/nginx\.conf \/etc\/nginx\/templates\/default\.conf\.template/);
  assert.match(dockerfile, /NGINX_ENVSUBST_FILTER='\^PUBLIC_ATTACHMENT_ORIGIN\$'/);
  assert.match(dockerfile, /ENV PUBLIC_ATTACHMENT_ORIGIN="'self'"/);
  // The only ${...} placeholder in the template is the one envsubst fills.
  assert.deepEqual([...new Set(conf.match(/\$\{[^}]*\}/g))], ['${PUBLIC_ATTACHMENT_ORIGIN}']);
  const compose = readFileSync(
    fileURLToPath(new URL('../docker-compose.production.yml', import.meta.url)),
    'utf8',
  );
  const edge = compose.match(/^ {2}edge:\n([\s\S]*?)(?=^ {2}\S|^\S)/m)[1];
  assert.match(edge, /PUBLIC_ATTACHMENT_ORIGIN: \$\{PUBLIC_ATTACHMENT_ORIGIN:-'self'\}/);
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
