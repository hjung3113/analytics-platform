// Lets plain node run the demo generator: EV packages export TypeScript source whose relative imports end in `.js`.
import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
