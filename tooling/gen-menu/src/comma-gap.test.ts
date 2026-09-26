import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { APP_PKG } from './generate.ts';
import { appSnapshot, makeFixture, removeFixture, runCli } from './fixture.ts';

/**
 * R4: the generated entry APPENDS after the (comma-less) last dependency, and a blank line
 * separates it from the closing brace — in three EOL shapes. Removing it must hand the comma
 * back to the previous entry across the whitespace.
 */
function gapAppPkg(eol: '\n' | '\r\n', eofNewline: boolean): string {
  const lines = [
    '{',
    '  "name": "fixture-app",',
    '  "private": true,',
    '  "dependencies": {',
    `    "${PACKAGE_PREFIX}menu-home": "workspace:*"`,
    '',
    '  }',
    '}',
  ];
  const text = lines.join(eol);
  return eofNewline ? text + eol : text;
}

describe('blank line before the dependencies closer (R4)', () => {
  const keep: string[] = [];
  const fresh = (appPkg: string): string => { const root = makeFixture({ appPkg, extraGroups: ['masterData'] }); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  for (const [eolName, eol] of [['LF', '\n'], ['CRLF', '\r\n']] as const) {
    for (const eofNewline of [true, false]) {
      it(`generate + remove restore exact bytes and valid JSON (${eolName}, eof newline: ${eofNewline})`, () => {
        const appPkg = gapAppPkg(eol, eofNewline);
        const root = fresh(appPkg);
        const pristine = appSnapshot(root);

        expect(runCli(['masterData', '--label-ko', 'm', '--label-en', 'm'], root).status).toBe(0);
        const afterGen = readFileSync(join(root, APP_PKG), 'utf8');
        expect(() => JSON.parse(afterGen), 'planned package.json must be valid JSON').not.toThrow();
        if (eol === '\r\n') expect(afterGen.replace(/\r\n/g, '').includes('\n')).toBe(false);

        expect(runCli(['--remove', 'masterData'], root).status).toBe(0);
        expect(readFileSync(join(root, APP_PKG), 'utf8')).toBe(appPkg);
        expect(appSnapshot(root)).toEqual(pristine);
        expect(() => JSON.parse(readFileSync(join(root, APP_PKG), 'utf8'))).not.toThrow();
      });
    }
  }
});
