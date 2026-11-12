import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { sourceWindowRequestSchema, type SourceRow } from '@ap/contract-schemas';
import { PLATFORM_SOURCE_LIMITS, clampTimeBudgetMs, truncateRowText } from '../domain/limits.js';
import { SourceReadError, toSourceReadError } from '../errors.js';
import { guardSourceReadPort } from '../ports/guarded.js';
import type { SourceReadPort } from '../ports/source-read.js';

/** Provider owns resolution of opaque refs. No client URL or filesystem path is opened by the generic adapter. */
export interface SourceProvider {
  open(sourceOwner: string, fileRef: string, signal: AbortSignal): Promise<AsyncIterable<Uint8Array> | null>;
}
const inside = (root: string, path: string) => { const rel = relative(root, path); return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); };

/** Linux/on-prem mount provider. Validate the opened descriptor, not just a pre-open pathname (symlink/rename races). */
export function createDirectoryProvider(roots: Readonly<Record<string, string>>, maxBytes = 64 * 1024 * 1024): SourceProvider {
  const configured = new Map(Object.entries(roots));
  return {
    async open(owner, fileRef, signal) {
      const rootPath = configured.get(owner);
      if (!rootPath || isAbsolute(fileRef) || fileRef.includes('\\') || fileRef.includes(':') || fileRef.split('/').some(part => part === '..' || part === '.' || part === '')) return null;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        const root = await realpath(rootPath);
        const path = resolve(root, fileRef);
        if (!inside(root, path) || !inside(root, await realpath(path))) return null;
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        // Fail closed where descriptor realpaths are unavailable. This also rejects an opened path moved outside the configured root.
        const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
        const stat = await handle.stat();
        if (!inside(root, openedPath) || !stat.isFile() || stat.size > maxBytes || signal.aborted) { await handle.close(); return null; }
        const owned = handle;
        return (async function* () {
          let bytes = 0;
          try {
            const stream = owned.createReadStream({ highWaterMark: 64 * 1024, autoClose: false, signal });
            for await (const chunk of stream) {
              bytes += (chunk as Buffer).length;
              if (bytes > maxBytes) throw new SourceReadError('adapter_failed');
              yield chunk as Buffer;
            }
          } finally { await owned.close(); }
        })();
      } catch (error) {
        await handle?.close().catch(() => undefined);
        if (signal.aborted) throw new SourceReadError('aborted');
        const code = (error as NodeJS.ErrnoException).code;
        if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'].includes(code ?? '')) return null;
        throw toSourceReadError(error);
      }
    },
  };
}

/** Bounded window only: UTF-8 lines, no domain parsing, no body or digest cache. Hash every byte before releasing any row. */
export function createProviderSourceReadPort(provider: SourceProvider): SourceReadPort {
  const raw: SourceReadPort = {
    describe: async () => ({ status: 'ok', available: true, capabilities: ['getWindow'], limits: PLATFORM_SOURCE_LIMITS, synthetic: false }),
    searchRecords: async () => ({ status: 'unsupported', reason: 'capability_missing' }),
    getParsed: async () => ({ status: 'unsupported', reason: 'parser_not_connected' }),
    getPeriods: async () => ({ status: 'unsupported', reason: 'periods_not_supported' }),
    getTopViewLink: async () => ({ status: 'unsupported', reason: 'top_view_not_connected' }),
    async getWindow(request, ctx) {
      if (!sourceWindowRequestSchema.safeParse(request).success) throw new SourceReadError('invalid_request');
      const manifest = ctx.trustedSampleSet;
      const file = manifest?.sourceOwner === request.sourceOwner ? manifest.files.find(f => f.fileRef === request.fileRef) : undefined;
      if (!manifest) return { status: 'unsupported', reason: 'capability_missing' };
      if (!file) return { status: 'source_absent' };
      const controller = new AbortController();
      const deadline = performance.now() + clampTimeBudgetMs(ctx.timeBudgetMs);
      let timedOut = false;
      const onAbort = () => controller.abort();
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, clampTimeBudgetMs(ctx.timeBudgetMs));
      const live = () => {
        if (ctx.signal.aborted) throw new SourceReadError('aborted');
        if (timedOut || performance.now() >= deadline) throw new SourceReadError('time_budget_exceeded');
      };
      try {
        live();
        const stream = await provider.open(request.sourceOwner, request.fileRef, controller.signal);
        if (!stream) return { status: 'source_absent' };
        const hash = createHash('sha256');
        const decoder = new StringDecoder('utf8');
        const rows: SourceRow[] = [];
        let line = 1; let text = ''; let length = 0;
        const first = Math.max(1, request.line - request.before); const last = request.line + request.after;
        const append = (part: string) => {
          if (line >= first && line <= last) {
            length += part.length;
            if (text.length < 8001) text += part.slice(0, 8001 - text.length);
          }
        };
        const finish = () => {
          if (line >= first && line <= last) {
            const value = text.endsWith('\r') && length <= 8001 ? text.slice(0, -1) : text;
            const cut = truncateRowText(value, 8000);
            rows.push({ fileRef: file.fileRef, fileOrder: file.order, line, text: cut.text, truncated: length > 8001 || cut.truncated, timestamp: null, timeReversal: false, synthetic: false });
          }
          line += 1; text = ''; length = 0;
        };
        let endedWithNewline = true;
        const consume = (chunk: string) => {
          let start = 0;
          for (let at = chunk.indexOf('\n', start); at !== -1; at = chunk.indexOf('\n', start)) {
            append(chunk.slice(start, at)); finish(); start = at + 1;
          }
          append(chunk.slice(start)); endedWithNewline = chunk.endsWith('\n');
        };
        for await (const bytes of stream) {
          live(); hash.update(bytes); const decoded = decoder.write(bytes); if (decoded) consume(decoded);
        }
        const tail = decoder.end(); if (tail) consume(tail);
        if (!endedWithNewline) finish();
        live();
        if (hash.digest('hex') !== file.sha256) return { status: 'source_absent' };
        return { status: 'ok', rows, truncated: rows.some(row => row.truncated) };
      } catch (error) {
        live(); throw toSourceReadError(error);
      } finally {
        clearTimeout(timer); ctx.signal.removeEventListener('abort', onAbort); controller.abort();
      }
    },
  };
  return guardSourceReadPort(raw);
}
