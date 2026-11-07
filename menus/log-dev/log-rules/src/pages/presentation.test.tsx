// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fullScope, Original, ScopeText, scopeSummary } from './presentation';

afterEach(cleanup);
describe('scope presentation', () => {
  it('summarizes list scope with counts while keeping full declarations in the drawer', () => {
    const scope = { modelIds: ['model-uuid'], softwareRange: '2.0–2.1', inputFormats: ['CSV'] };
    expect(scopeSummary(scope)).toBe('모델 1개 · SW 2.0–2.1 · CSV');
    expect(fullScope(scope)).toBe('modelIds: model-uuid · softwareRange: 2.0–2.1 · inputFormats: CSV');
    render(<><ScopeText scope={scope} summary /><ScopeText scope={scope} /></>);
    expect(screen.getByText(scopeSummary(scope)).className).toContain('truncate');
    expect(screen.getByText(fullScope(scope)).className).toContain('break-words');
  });
  it.each([null, {}])('renders missing scope as Korean prose (%s)', scope => {
    render(<ScopeText scope={scope} />);
    const text = screen.getByText(fullScope(scope));
    expect(text.className).toContain('break-keep');
    expect(text.className).not.toContain('t-mono');
  });
  it('wraps original code-like values without break-all', () => {
    render(<Original>UNBROKEN_TARGET_VALUE</Original>);
    expect(screen.getByText('UNBROKEN_TARGET_VALUE').className).toContain('break-words');
    expect(screen.getByText('UNBROKEN_TARGET_VALUE').className).not.toContain('break-all');
  });
});
