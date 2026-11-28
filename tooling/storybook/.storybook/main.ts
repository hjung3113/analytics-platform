import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import { designSources } from './design-sources';
import { docgenOptions } from './docgen';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
  core: { disableTelemetry: true },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: docgenOptions,
  },
  viteFinal: vite => ({ ...vite, plugins: [...(vite.plugins ?? []), tailwindcss(), designSources()] }),
};
export default config;
