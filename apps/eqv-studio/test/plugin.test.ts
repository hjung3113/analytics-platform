import { createServer, request } from 'node:http';
import { once } from 'node:events';
import type { Connect, ViteDevServer } from 'vite';
import { expect, it } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { studioFiles } from '../server/plugin.js';
import { DATA_ROOT_UNSET } from '../server/roots.js';

it('returns JSON 413 for a chunked over-limit body before the upload ends', async () => {
  let middleware!: Connect.NextHandleFunction;
  process.env.EQV_STUDIO_ASSETS = process.cwd();
  const plugin = studioFiles();
  if (typeof plugin.configureServer !== 'function') throw new Error('Missing middleware hook');
  Reflect.apply(plugin.configureServer, undefined, [{
    middlewares: { use: (handler: Connect.NextHandleFunction) => { middleware = handler; } },
  } as unknown as ViteDevServer]);
  const server = createServer((req, res) => middleware(req, res, () => res.end()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  const upload = request({
    host: '127.0.0.1', port: address.port, path: '/api/layout-revisions', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const response = new Promise<{ status: number | undefined; type: string | undefined; body: string }>((resolve, reject) => {
      upload.on('error', reject);
      upload.on('response', (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
        res.on('error', reject);
      });
    });
    const chunk = Buffer.alloc(1024 * 1024, ' ');
    for (let index = 0; index < 6; index++) upload.write(chunk);
    const result = await response;
    expect(result.status).toBe(413);
    expect(result.type).toBe('application/json');
    expect(JSON.parse(result.body)).toEqual({ error: 'Body exceeds 5 MiB' });
  } finally {
    upload.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

/** `root` is the data root (`EQV_STUDIO_ASSETS`); `null` leaves it unset. The default is this app's folder, inside the repository. */
async function withStudio<T>(run: (port: number) => Promise<T>, root: string | null = process.cwd()): Promise<T> {
  let middleware!: Connect.NextHandleFunction;
  if (root === null) delete process.env.EQV_STUDIO_ASSETS;
  else process.env.EQV_STUDIO_ASSETS = root;
  const plugin = studioFiles();
  if (typeof plugin.configureServer !== 'function') throw new Error('Missing middleware hook');
  Reflect.apply(plugin.configureServer, undefined, [{
    middlewares: { use: (handler: Connect.NextHandleFunction) => { middleware = handler; } },
  } as unknown as ViteDevServer]);
  const server = createServer((req, res) => middleware(req, res, () => res.end()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  try {
    return await run(address.port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function upload(port: number, megabytes: number, end: boolean) {
  const req = request({
    host: '127.0.0.1', port, path: '/api/import/windows?equipmentId=x', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const response = new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
    req.on('error', reject);
    req.on('response', (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
  });
  const chunk = Buffer.alloc(1024 * 1024, ' ');
  for (let index = 0; index < megabytes; index++) req.write(chunk);
  if (end) req.end();
  return { req, response };
}

it('allows 32 MiB on /api/import/*: a chunked 33 MiB upload is 413 naming that limit', async () => {
  await withStudio(async (port) => {
    const { req, response } = upload(port, 33, false);
    try {
      const result = await response;
      expect(result.status).toBe(413);
      expect(JSON.parse(result.body)).toEqual({ error: 'Body exceeds 32 MiB' });
    } finally {
      req.destroy();
    }
  });
});

it('does not 413 a 6 MiB import body: it reaches the handler (the data root is inside the repo, so 403)', async () => {
  await withStudio(async (port) => {
    const { req, response } = upload(port, 6, true);
    try {
      const result = await response;
      expect(result.status).toBe(403);
      expect(JSON.parse(result.body)).toEqual({ error: '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요' });
    } finally {
      req.destroy();
    }
  });
});

const importStatus = async (port: number) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/import/status`);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

it('answers every /api call with 503 and the reason while EQV_STUDIO_ASSETS is unset (no default inside the repo)', async () => {
  await withStudio(async (port) => {
    const result = await importStatus(port);
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: DATA_ROOT_UNSET });
  }, null);
});

it('refuses imports for a data root that is a symlink into the repository, and reports the reason', async () => {
  const base = await mkdtemp(join(tmpdir(), 'eqv-plugin-link-'));
  try {
    const link = join(base, 'link');
    await symlink(process.cwd(), link);
    await withStudio(async (port) => {
      const result = await importStatus(port);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ enabled: false, reason: '저장소 밖 경로를 EQV_STUDIO_ASSETS로 지정하세요' });
    }, link);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

it('enables imports for a data root outside the repository', async () => {
  const base = await mkdtemp(join(tmpdir(), 'eqv-plugin-out-'));
  try {
    await withStudio(async (port) => {
      expect(await importStatus(port)).toMatchObject({ status: 200, body: { enabled: true } });
    }, base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
