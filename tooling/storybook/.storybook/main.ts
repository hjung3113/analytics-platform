import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import ts from 'typescript';
import { designSources } from './design-sources';

const SDK = new URL('../../../packages/sdk/', import.meta.url).pathname;

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
  core: { disableTelemetry: true },
  // Props tables come from the TS types of the SDK sources. They sit outside this package's tsconfig, so the docgen program is
  // built from `include` with its own compiler options. HTML attributes inherited from React's DOM types stay out.
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      include: [`${SDK}{ui,components}/src/**/*.tsx`],
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true },
      exclude: ['**/*.test.tsx', '**/__tests__/**'],
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: prop => !prop.parent?.fileName.includes('node_modules'),
    },
  },
  viteFinal: vite => ({ ...vite, plugins: [...(vite.plugins ?? []), tailwindcss(), designSources()] }),
};
export default config;
