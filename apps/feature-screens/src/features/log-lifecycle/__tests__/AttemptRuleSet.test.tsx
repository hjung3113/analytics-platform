// #1496 R-f: the RuleSet column of the attempt list — each catalog state in words, a link only when matched, never colour alone.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Attempt, Presentation, TableParts } from '../contracts';
import { Attempts } from '../RequestsScreen';
import { RULE_SET_STATE_TEXT } from '../RuleSetCell';

function Table<T extends { id: string }>(p: TableParts<T>) {
  return <table aria-label={p.title}><thead><tr>{p.columns.map(c => <th key={c.id}>{c.header}</th>)}</tr></thead><tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}</tr>)}</tbody></table>;
}
const ui = { table: Table } as unknown as Presentation;
const attempt = (n: number, ruleSet: Attempt['ruleSet']): Attempt => ({ id: `id-${n}`, attemptNo: n, outcome: 'succeeded', workerActorId: 'w', verdict: 'pass', manifestMatches: true, counts: {}, requiredUnchecked: 0, ruleCount: 0, startedAt: '2026-11-08T00:00:00Z', endedAt: null, ruleSetRevision: ruleSet ? 'rev' : null, inputManifestDigest: '', ...(ruleSet === undefined ? {} : { ruleSet }) });
const RuleSetLink = ({ ruleSetKey, children }: { ruleSetKey: string; children: React.ReactNode }) => <a href={`/rules?ruleSetKey=${ruleSetKey}`}>{children}</a>;
afterEach(cleanup);

describe('Attempts RuleSet column (#1496)', () => {
  it('matched: «RuleSet · revision» links to that RuleSet; a non-current Revision says «현재 아님»', () => {
    render(<Attempts ui={ui} RuleSetLink={RuleSetLink} attempts={[
      attempt(1, { state: 'matched', ruleSetKey: 'core', revision: 'r1', isCurrent: false, status: 'retired' }),
      attempt(2, { state: 'matched', ruleSetKey: 'core', revision: 'r2', isCurrent: true, status: 'active' }),
    ]} />);
    expect(screen.getByRole('columnheader', { name: '규칙 세트' })).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.map(l => [l.textContent, l.getAttribute('href')])).toEqual([['core · r2', '/rules?ruleSetKey=core'], ['core · r1', '/rules?ruleSetKey=core']]);
    expect(screen.getAllByText('현재 아님')).toHaveLength(1);
  });

  it.each([
    ['ambiguous', 'ambiguous'],
    ['unknown', 'unknown'],
    ['no_catalog', 'no_catalog'],
    ['unavailable', 'unavailable'],
  ] as const)('%s: the state in words and no link', (state, key) => {
    render(<Attempts ui={ui} RuleSetLink={RuleSetLink} attempts={[attempt(1, { state })]} />);
    expect(screen.getByText(RULE_SET_STATE_TEXT[key])).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('the exact copy of each state, and «—» for an attempt without a revision', () => {
    expect(RULE_SET_STATE_TEXT).toEqual({ ambiguous: '여러 RuleSet에 해당 — 연결하지 않음', unknown: '카탈로그에 없음', no_catalog: '카탈로그 미수신', unavailable: '규칙 세트를 확인하지 못함', none: '—' });
    render(<Attempts ui={ui} RuleSetLink={RuleSetLink} attempts={[attempt(1, null)]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a table cell truncates the name with the full text as title and keeps «현재 아님» visible; the compact list wraps it', () => {
    const matched = attempt(1, { state: 'matched', ruleSetKey: 'core', revision: 'synthetic-v1', isCurrent: false, status: 'retired' });
    const { unmount } = render(<Attempts ui={ui} attempts={[matched]} />);
    const name = screen.getByText('core · synthetic-v1');
    expect(name.className).toContain('truncate');
    expect(name.getAttribute('title')).toBe('core · synthetic-v1');
    expect(screen.getByText('현재 아님')).toBeTruthy();
    unmount();
    render(<Attempts ui={ui} compact attempts={[matched]} />);
    expect(screen.getByText('core · synthetic-v1').className).toContain('break-all');
  });

  it('the compact list (request drawer) carries the same cell; without a link component the name is plain text', () => {
    render(<Attempts ui={ui} compact attempts={[attempt(1, { state: 'matched', ruleSetKey: 'core', revision: 'r2', isCurrent: true, status: 'active' })]} />);
    expect(screen.getByText('규칙 세트')).toBeTruthy();
    expect(screen.getByText('core · r2')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
