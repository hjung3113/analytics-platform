// Single source (#2828): the 기초 pages and the 사용 지침 quotes read the design files at build time, never a copy of them.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const ID = 'virtual:design-sources';
const UI_SRC = path.resolve(path.dirname(createRequire(import.meta.url).resolve('@ap/ui/theme-tokens.json')), '..');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FILES = {
  colors: path.join(UI_SRC, 'theme/theme-tokens.json'),
  tokens: path.join(UI_SRC, 'styles/tokens.css'),
  platform: path.join(UI_SRC, 'styles/platform-tokens.css'),
  roles: path.join(UI_SRC, 'styles/index.css'),
  design: path.join(ROOT, 'DESIGN.md'),
  components: path.join(ROOT, 'docs/contract/components.md'),
};

/** `--name: value; /* note *\/` declarations of a stylesheet, in file order. */
const cssVars = (css: string) => [...css.matchAll(/^\s*--([\w-]+):\s*([^;]+);[ \t]*(?:\/\*\s*(.*?)\s*\*\/)?/gm)]
  .map(([, name, value, note]) => ({ name: name!, value: value!.trim(), note: note ?? '' }));

export function designSources(): Plugin {
  return {
    name: 'ap-design-sources',
    resolveId: id => (id === ID ? `\0${ID}` : null),
    load(id) {
      if (id !== `\0${ID}`) return null;
      for (const file of Object.values(FILES)) this.addWatchFile(file);
      const read = (file: string) => readFileSync(file, 'utf8');
      const json = JSON.parse(read(FILES.colors)) as { color: Record<string, { $value: { hex: string } }> };
      const data = {
        colors: Object.entries(json.color).map(([name, token]) => ({ name, hex: token.$value.hex })),
        vars: [...cssVars(read(FILES.tokens)), ...cssVars(read(FILES.platform))],
        roles: [...read(FILES.roles).matchAll(/^\s*\.(t-[\w-]+|tabular)\s*\{\s*([^}]*?)\s*\}/gm)].map(([, name, css]) => ({ name: name!, css: css! })),
        docs: { 'DESIGN.md': read(FILES.design), 'docs/contract/components.md': read(FILES.components) },
      };
      return Object.entries(data).map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`).join('\n');
    },
  };
}
