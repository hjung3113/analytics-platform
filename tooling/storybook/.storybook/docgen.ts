import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import ts from 'typescript';

type DocgenOptions = NonNullable<NonNullable<StorybookConfig['typescript']>['reactDocgenTypescriptOptions']>;

// Inherited props worth a Props row on the @ap/ui wrappers: the public state and value props of Radix (the rest of Radix stays out)
// and, of React's DOM attributes, only those that carry the control's state (Radix Checkbox takes `disabled` from the DOM button).
const RADIX_PROPS = new Set(['open', 'defaultOpen', 'onOpenChange', 'modal', 'side', 'align', 'sideOffset', 'delayDuration',
  'checked', 'defaultChecked', 'onCheckedChange', 'value', 'defaultValue', 'onValueChange', 'disabled', 'required', 'type', 'orientation']);
// Not defaultValue/defaultChecked: every element's HTMLAttributes carries them, so they would add a row to each div-based part.
const DOM_PROPS = new Set(['checked', 'value', 'disabled']);
export const SDK = fileURLToPath(new URL('../../../packages/sdk/', import.meta.url));

// The SDK's own compiler options, `strict` included: without strictNullChecks the checker drops `null` from every type, and
// `value: string | null` read as `string` in the Props table (#2949).
const base = createRequire(import.meta.url).resolve('@ap/tsconfig/base.json');
const compilerOptions = ts.parseJsonConfigFileContent(ts.readConfigFile(base, ts.sys.readFile).config, ts.sys, SDK).options;

/**
 * Props tables come from the TS types of the SDK sources. They sit outside this package's tsconfig, so the docgen program is built
 * from `include` with the SDK's base compiler options. Of the HTML attributes inherited from React's DOM types only DOM_PROPS pass;
 * of Radix's own props only RADIX_PROPS pass.
 */
export const docgenOptions = {
  include: [`${SDK}{ui,components}/src/**/*.tsx`],
  compilerOptions,
  exclude: ['**/*.test.tsx', '**/__tests__/**'],
  shouldExtractLiteralValuesFromEnum: true,
  // Under strict an optional prop's type gains `| undefined`; the table already marks the prop optional.
  shouldRemoveUndefinedFromOptional: true,
  propFilter: prop => !prop.parent?.fileName.includes('node_modules') || (/[/@]radix-ui/.test(prop.parent.fileName) && RADIX_PROPS.has(prop.name))
    || (/[/@]types\/react\//.test(prop.parent.fileName) && DOM_PROPS.has(prop.name)),
} satisfies DocgenOptions;
