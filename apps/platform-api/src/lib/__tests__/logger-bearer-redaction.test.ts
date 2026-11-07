import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createRootLogger } from '../logger.js';

describe('request log redaction of the Bearer API token', () => {
  it('removes req.headers.authorization from the log line', () => {
    const chunks: string[] = [];
    const sink = new Writable({ write(chunk, _enc, cb) { chunks.push(String(chunk)); cb(); } });
    const log = createRootLogger({ NODE_ENV: 'development' }, sink);
    const secret = `ap_deadbeef_${'S'.repeat(43)}`;
    log.info({ req: { method: 'POST', url: '/api/v1/menu-query', headers: { authorization: `Bearer ${secret}`, cookie: 'platform_session=x' } } }, 'incoming request');
    const line = chunks.join('');
    expect(line).toContain('incoming request');
    expect(line).not.toContain(secret);
    expect(line).not.toContain('Bearer');
    expect(line).not.toContain('platform_session');
  });
});
