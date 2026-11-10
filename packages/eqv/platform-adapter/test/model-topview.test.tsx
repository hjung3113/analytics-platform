// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { layoutRevision, validateLayout } from '@eqv/core';
import ModelTopViewBody, { DISCLOSURE, MISMATCH_TEXT } from '../src/model-topview-body';
import { ModelTopView } from '../src/model-topview';

// The vitest root is the package directory.
const MOCK_DIR = resolve(process.cwd(), '../../../menus/log-dev/log-knowledge/src/mock');
const FIXTURE = resolve(MOCK_DIR, 'topview-fixture.json');
const MOCK = resolve(MOCK_DIR, 'topview.ts');
const document = JSON.parse(readFileSync(FIXTURE, 'utf8')) as unknown;
afterEach(cleanup);

describe('Hub mock Top View fixture', () => {
  it('passes validateLayout and its stored Revision hash equals layoutRevision(document)', async () => {
    const result = validateLayout(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = /FIXTURE_REVISION = '(sha256:[0-9a-f]{64})'/.exec(readFileSync(MOCK, 'utf8'))?.[1];
    expect(stored).toBe(await layoutRevision(result.layout));
  });
});

describe('ModelTopView', () => {
  it('draws the Layout read-only when the hash matches, with the disclosure below', async () => {
    const result = validateLayout(document);
    if (!result.ok) throw new Error('fixture invalid');
    const revision = await layoutRevision(result.layout);
    const { container } = render(<ModelTopViewBody layoutId="sample-layout" revision={revision} document={document} />);
    expect(await screen.findByText(DISCLOSURE)).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /맞춤/ })).toBeTruthy();
  });

  it('shows the error line and no drawing on a hash mismatch', async () => {
    const { container } = render(<ModelTopViewBody layoutId="sample-layout" revision={`sha256:${'0'.repeat(64)}`} document={document} />);
    expect((await screen.findByRole('alert')).textContent).toBe(MISMATCH_TEXT);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText(DISCLOSURE)).toBeTruthy();
  });

  it('shows the error line for a document that is not a Layout', async () => {
    const { container } = render(<ModelTopViewBody layoutId="x" revision={`sha256:${'0'.repeat(64)}`} document={{ kind: 'nope' }} />);
    expect((await screen.findByRole('alert')).textContent).toBe(MISMATCH_TEXT);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('the lazy wrapper loads its body', async () => {
    render(<ModelTopView layoutId="x" revision={`sha256:${'0'.repeat(64)}`} document={{}} />);
    expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toBeTruthy();
  });
});
