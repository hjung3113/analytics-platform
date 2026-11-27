import { withCompilerOptions } from 'react-docgen-typescript';
import { describe, expect, it } from 'vitest';
import { docgenOptions, SDK } from '../docgen';

// The Props table reads these names; parse with the same options Storybook passes to the docgen plugin.
const { include: _include, exclude: _exclude, compilerOptions, ...parserOptions } = docgenOptions;
const parser = withCompilerOptions(compilerOptions, parserOptions);
const propTypes = (file: string, component: string) => {
  const doc = parser.parse(`${SDK}${file}`).find(entry => entry.displayName === component);
  if (!doc) throw new Error(`${component} not documented in ${file}`);
  return Object.fromEntries(Object.entries(doc.props).map(([name, prop]) => [name, prop.type.name]));
};

describe('Storybook docgen options', () => {
  // #2949: without strict null checks `string | null` read as `string`.
  it('keeps null in a value type and its change handler', () => {
    const types = propTypes('ui/src/forms/DatePicker.tsx', 'DatePicker');
    expect(types.value).toBe('string | null');
    expect(types.onChange).toBe('(value: string | null) => void');
  });

  it('keeps a readonly array and drops undefined from an optional prop', () => {
    const types = propTypes('ui/src/components/shadcn/multi-combobox.tsx', 'MultiCombobox');
    expect(types.values).toBe('readonly string[]');
    expect(types.maxSelected).toBe('number');
  });
});
