import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Combobox } from '../../components/shadcn/combobox';
import { Input } from '../../components/shadcn/input';
import { MultiCombobox } from '../../components/shadcn/multi-combobox';
import { Textarea } from '../../components/shadcn/textarea';
import { FormField } from '../FormField';

afterEach(cleanup);

it('links the label, then hint, error and extra ids to the one input, and marks invalid and required', () => {
  render(<FormField label="제목" required hint="30자 이하" error="입력 길이가 너무 깁니다" describedBy="extra" id="t">
    {control => <Input {...control} />}
  </FormField>);
  const input = screen.getByLabelText(/제목/);
  expect(input).toHaveAttribute('id', 't');
  expect(input).toHaveAttribute('aria-describedby', 't-hint t-error extra');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAttribute('aria-required', 'true');
  expect(document.getElementById('t-hint')).toHaveTextContent('30자 이하');
  expect(document.getElementById('t-error')).toHaveTextContent('입력 길이가 너무 깁니다');
});

it('keeps the hint visible while an error shows and uses no live role for the error', () => {
  render(<FormField label="제목" hint="30자 이하" error="입력 길이가 너무 깁니다" id="t">{control => <Input {...control} />}</FormField>);
  expect(screen.getByText('30자 이하')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.querySelector('[aria-live]')).toBeNull();
  expect(screen.getByText('입력 길이가 너무 깁니다')).toHaveClass('break-keep', 'text-text-danger-label');
});

it('adds no aria-invalid, aria-required or describedby when there is nothing to say', () => {
  render(<FormField label="제목">{control => <Input {...control} />}</FormField>);
  const input = screen.getByLabelText('제목');
  expect(input.id).not.toBe('');
  expect(input).not.toHaveAttribute('aria-describedby');
  expect(input).not.toHaveAttribute('aria-invalid');
  expect(input).not.toHaveAttribute('aria-required');
});

it('treats an empty-string error as no error and appends only the caller describedBy', () => {
  render(<FormField label="제목" error="" describedBy="extra">{control => <Input {...control} />}</FormField>);
  const input = screen.getByLabelText('제목');
  expect(input).toHaveAttribute('aria-describedby', 'extra');
  expect(input).not.toHaveAttribute('aria-invalid');
});

it.each([
  ['Input', (c: object) => <Input {...c} />],
  ['Textarea', (c: object) => <Textarea {...c} />],
])('the error border is painted by the %s itself', (_name, render_) => {
  render(<FormField label="제목" error="오류" id="x">{control => render_(control)}</FormField>);
  expect(screen.getByLabelText('제목')).toHaveClass('aria-invalid:border-accent-danger');
});

it('reaches the Combobox trigger, with aria-required, and the MultiCombobox field border', () => {
  const { unmount } = render(<FormField label="설비" required error="오류" id="c">
    {control => <Combobox {...control} options={[{ value: 'a', label: 'A' }]} value={null} onChange={() => {}} />}
  </FormField>);
  const trigger = screen.getByRole('combobox');
  expect(trigger).toHaveAttribute('aria-required', 'true');
  expect(trigger).toHaveAttribute('aria-invalid', 'true');
  expect(trigger).toHaveClass('aria-invalid:border-accent-danger');
  unmount();
  render(<FormField label="공정" error="오류" id="m">
    {control => <MultiCombobox {...control} options={[{ value: 'a', label: 'A' }]} values={[]} onValuesChange={() => {}} clearAllLabel="비우기" removeLabel={v => `${v} 빼기`} loadingText="…" retryLabel="다시" label="공정" selectedSummaryLabel={n => `${n}`} moreLabel="더" listboxLabel="목록" emptyText="없음" />}
  </FormField>);
  const field = document.querySelector('[class*="has-[[aria-invalid=true]]:border-accent-danger"]');
  expect(field).not.toBeNull();
  expect(field!.querySelector('[aria-invalid="true"]')).not.toBeNull();
});
