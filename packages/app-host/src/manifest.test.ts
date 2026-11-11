import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;

describe('@ap/app-host manifest (host-entry-contract §3)', () => {
  it('declares no dependency on a feature bridge, menu, EV, mock or HTTP package', () => {
    const names = ['dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies'].flatMap(field => Object.keys(manifest[field] ?? {}));
    const banned = names.filter(name => name === '@ap/feature-bridge' || name.startsWith('@ap/menu-') || name.startsWith('@eqv/') || name === '@ap/mock-server' || name === '@ap/http-adapter');
    expect(banned).toEqual([]);
  });

  it('exposes the entry and its stylesheet', () => {
    expect(Object.keys(manifest.exports ?? {})).toEqual(['.', './styles.css']);
  });
});
