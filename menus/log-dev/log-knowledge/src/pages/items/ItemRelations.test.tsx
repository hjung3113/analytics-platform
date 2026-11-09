// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import { RelationEditor } from './ItemRelations';
import type { RelationRow } from './itemRelationModel';

const row: RelationRow = { kind: 'observed', source: 'CHAMBER/STEP_PROCESS', target: 'CHAMBER/PROCESS_START', predicate: 'before' };
function Harness({ initial = [row] }: { initial?: RelationRow[] }) {
  const [rows, setRows] = useState(initial);
  return <I18nProvider><RelationEditor rows={rows} onChange={setRows} options={['CHAMBER/STEP_PROCESS', 'CHAMBER/PROCESS_START']} errors={{}} specReady /></I18nProvider>;
}
afterEach(cleanup);
describe('confirmed collapsed Event relation editor', () => {
  it('starts collapsed, names the kind and order, and expands from the edit button', () => {
    render(<Harness />);
    expect(screen.getByText('기록하지 않아도 저장됩니다.')).toBeTruthy();
    expect(screen.getByText('관찰')).toBeTruthy();
    expect(screen.getByRole('group', { name: '관계 1' }).textContent).toContain('보다 먼저 일어남');
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '관계 1 수정' }));
    expect(screen.getByRole('combobox', { name: 'Event A' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Event B' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '나중' }));
    fireEvent.click(screen.getByRole('button', { name: '입력 접기' }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('group', { name: '관계 1' }).textContent).toContain('보다 나중에 일어남');
  });
  it('adds, edits a free key by keyboard and removes a row', () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByRole('button', { name: '관계 추가' }));
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: '종류' }));
    const source = screen.getByRole('combobox', { name: 'Event A' });
    fireEvent.keyDown(source, { key: 'ArrowDown' });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'CHAMBER/CUSTOM_READY' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('combobox', { name: 'Event A' }).textContent).toContain('CHAMBER/CUSTOM_READY');
    expect(screen.getByText('명세에 없는 Event')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '관계 1 빼기' }));
    expect(screen.queryByRole('group', { name: /관계 1/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '관계 추가' }));
  });
  it('stops at twenty while preserving remove controls', () => {
    render(<Harness initial={Array.from({ length: 20 }, (_, i) => ({ ...row, source: `CHAMBER/E${i}` }))} />);
    expect((screen.getByRole('button', { name: '관계 추가' }) as HTMLButtonElement).disabled).toBe(true);
    const relation = screen.getByRole('group', { name: '관계 20' });
    fireEvent.click(within(relation).getByRole('button', { name: '관계 20 빼기' }));
    expect((screen.getByRole('button', { name: '관계 추가' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([0, 1])('keeps keyboard focus in the expanded remaining row when removing row %s', removed => {
    render(<Harness initial={[row, { ...row, kind: 'expected' }]} />);
    fireEvent.click(screen.getByRole('button', { name: `관계 ${2 - removed} 수정` }));
    const remove = screen.getByRole('button', { name: `관계 ${removed + 1} 빼기` });
    remove.focus();
    // jsdom does not perform a native button's default Enter activation.
    fireEvent.keyDown(remove, { key: 'Enter' });
    fireEvent.click(remove);
    expect(screen.getAllByRole('group', { name: /^관계 \d+$/ })).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: '종류' }));
  });
  it.each([0, 1])('returns focus to the collapsed remaining row when removing row %s', removed => {
    render(<Harness initial={[row, row]} />);
    const remove = screen.getByRole('button', { name: `관계 ${removed + 1} 빼기` });
    remove.focus();
    fireEvent.click(remove);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '관계 1 수정' }));
  });
  it('shows unknown stable keys in the collapsed summary', () => {
    render(<Harness initial={[{ ...row, target: 'CHAMBER/CUSTOM_READY' }]} />);
    expect(screen.getByText('명세에 없는 Event')).toBeTruthy();
    expect(screen.getByRole('group', { name: '관계 1' }).textContent).toContain('CHAMBER/CUSTOM_READY');
  });
});
