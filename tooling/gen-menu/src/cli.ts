import { parseArgs } from 'node:util';
import {
  GenMenuError, applyGenerate, editSummary, planGenerate, resolveRoot,
} from './generate.ts';
import { applyRemove, planRemove } from './remove.ts';

const USAGE = `gen:menu — scaffold one skeleton menu package for an existing sidebar group

Usage:
  pnpm gen:menu <group> [--menu <id>] [--label-ko <s>] [--label-en <s>] [--path <route>] [--page-type <archetype>] [--dry-run] [--root <dir>]
  pnpm gen:menu --remove <group> [--dry-run] [--root <dir>]

<group> must already exist in the GroupId union (packages/contracts/src/menu.ts)
and GROUPS (apps/platform-web/src/menus.ts); the generator does not add sidebar groups.
Archetypes: overview | analysis | management | catalog | workflow (default overview).`;

type Args = {
  help: boolean;
  remove: boolean;
  menu?: string;
  'label-ko'?: string;
  'label-en'?: string;
  path?: string;
  'page-type'?: string;
  'dry-run': boolean;
  root?: string;
};

function parse(argv: string[]): { values: Args; positionals: string[] } {
  return parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', default: false },
      remove: { type: 'boolean', default: false },
      menu: { type: 'string' },
      'label-ko': { type: 'string' },
      'label-en': { type: 'string' },
      path: { type: 'string' },
      'page-type': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      root: { type: 'string' },
    },
    allowPositionals: true,
  }) as { values: Args; positionals: string[] };
}

function run(argv: string[]): void {
  const { values, positionals } = parse(argv);
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length !== 1) {
    console.error(`gen:menu: exactly one <group> positional is required\n\n${USAGE}`);
    process.exit(1);
  }
  const group = positionals[0];
  const dryRun = values['dry-run'];

  if (values.remove) {
    for (const flag of ['menu', 'label-ko', 'label-en', 'path', 'page-type'] as const) {
      if (values[flag] !== undefined) {
        console.error(`gen:menu: --remove does not take --${flag}`);
        process.exit(1);
      }
    }
  }

  const root = resolveRoot(values.root);

  if (values.remove) {
    const plan = planRemove(root, group);
    if (dryRun) {
      console.log('gen:menu: dry run — nothing written');
      for (const ins of plan.inserts) console.log(`  unedit ${ins.relPath}: ${ins.line.trimStart()}`);
      console.log(`  delete ${plan.deleteDir}/`);
      console.log('next: pnpm install');
      return;
    }
    applyRemove(plan);
    for (const ins of plan.inserts) console.log(`unedit ${ins.relPath}: ${ins.line.trimStart()}`);
    console.log(`deleted ${plan.deleteDir}/`);
    console.log('next: pnpm install');
    return;
  }

  const plan = planGenerate({
    root,
    group,
    menu: values.menu,
    labelKo: values['label-ko'],
    labelEn: values['label-en'],
    path: values.path,
    pageType: values['page-type'],
  });
  const pkgDir = `menus/${plan.inputs.folder}`;
  if (dryRun) {
    console.log('gen:menu: dry run — nothing written');
    for (const f of plan.files) console.log(`  create ${pkgDir}/${f.relPath}`);
    console.log(`  create ${pkgDir}/.gen-menu.json`);
    for (const line of editSummary(plan)) console.log(`  edit ${line}`);
    console.log('next: pnpm install');
    return;
  }
  applyGenerate(plan);
  for (const f of plan.files) console.log(`created ${pkgDir}/${f.relPath}`);
  console.log(`created ${pkgDir}/.gen-menu.json`);
  for (const line of editSummary(plan)) console.log(`edit ${line}`);
  console.log('next: pnpm install');
}

try {
  run(process.argv.slice(2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`gen:menu: ${message}`);
  process.exit(1);
}
