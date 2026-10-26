import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { FieldList, FieldRow } from '@ap/ui';
import { Field } from './DetailDrawer';

// #891: the deprecated `Field` and `FieldRow layout="detail"` inside a `FieldList` draw the same rows, so moving a menu from one to the
// other changes nothing on screen.
afterEach(cleanup);

/** Element tree with sorted class lists; wrapper `dl` and text kept. */
function shape(node: ReactNode): string {
  const { container } = render(<>{node}</>);
  const out = container.innerHTML;
  cleanup();
  return out.replace(/class="([^"]*)"/g, (_, classes: string) => `class="${classes.split(/\s+/).filter(Boolean).sort().join(' ')}"`);
}

describe('Field and FieldRow layout="detail" (#891)', () => {
  it.each([
    ['a camelCase string label', 'averageOfRatiosAllowed', 'true', false],
    ['a plain label with a mono value', '단위', 'min', true],
    ['an element label', <span key="l">소유 조직</span>, <b key="v">MEM</b>, false],
  ] as const)('draws the same rows for %s', (_, label, value, mono) => {
    const before = shape(<dl><Field label={label} mono={mono}>{value}</Field><Field label="last">x</Field></dl>);
    const after = shape(<FieldList><FieldRow layout="detail" label={label} mono={mono}>{value}</FieldRow><FieldRow layout="detail" label="last">x</FieldRow></FieldList>);
    expect(after).toBe(before);
  });
});
