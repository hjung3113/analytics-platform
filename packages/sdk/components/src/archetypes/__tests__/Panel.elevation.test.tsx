import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';
import { Panel } from '../PlatformPage';

afterEach(cleanup);

// v0.41 review C1: a caller shadow must still yield to a card, detail or dock ancestor, in and out of a workspace panel.
it('keeps the nested shadow guard next to a caller shadow outside a workspace panel', () => {
  const { container } = render(<Panel title="A" className="shadow-lg">body</Panel>);
  expect(container.querySelector('section')).toHaveClass('elevation-panel', 'shadow-lg');
});

it('keeps only the nested guard inside a workspace panel, with no default shadow', () => {
  const { container } = render(<InWorkspacePanelProvider value><Panel title="A" className="shadow-lg">body</Panel></InWorkspacePanelProvider>);
  const section = container.querySelector('section');
  expect(section).toHaveClass('elevation-flat', 'shadow-lg');
  expect(section).not.toHaveClass('elevation-panel');
});
