import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDirectoryProvider, createProviderSourceReadPort, type SourceProvider } from '../adapters/provider-source.js';
import { runSourceWindowContract } from '../testing/source-read-contract.js';

const roots: string[] = [];
const marker = 'synthetic-provider-private-failure';
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

runSourceWindowContract({ describe, it, expect } as never, {
  name: 'directory verified window', synthetic: false, failureMarker: marker, capabilities: ['getWindow'],
  async setup(scenario) {
    const root = await mkdtemp(join(tmpdir(), 'source-contract-')); roots.push(root);
    const text = scenario === 'long_line' ? `short\n${'x'.repeat(9000)}\nshort\n` : 'synthetic row\n'.repeat(450);
    await writeFile(join(root, 'sample.log'), text);
    const sampleSet = { sourceOwner: 'fixture', files: [{ fileRef: 'sample.log', order: 1, sha256: createHash('sha256').update(text).digest('hex') }] };
    const directory = createDirectoryProvider({ fixture: root });
    const provider: SourceProvider = scenario === 'absent_source' ? { open: async () => null }
      : scenario === 'failing' ? { open: async () => { throw new Error(marker); } }
      : scenario === 'slow' ? { open: async (_owner, _ref, signal) => (async function* () {
        yield Buffer.from('first chunk\n');
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new Error(marker)); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1200);
          if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        });
        yield Buffer.from('last chunk\n');
      })() } : directory;
    return { port: createProviderSourceReadPort(provider), sampleSet, probe: { fileRef: 'sample.log', line: scenario === 'long_line' ? 2 : 160 } };
  },
});
