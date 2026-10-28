import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assembly = resolve(appRoot, 'src/real/http-assembly.tsx');
const result = spawnSync('pnpm', ['run', 'build:prod'], {
  cwd: appRoot,
  env: { ...process.env, AP_PLATFORM_ASSEMBLY: assembly },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Could not run the real-assembly production build: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
