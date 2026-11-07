/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { FieldRow } from '../FieldRow.js';
import { FieldList } from '../FieldList.js';

describe('FieldRow', () => {
  it('renders label text', () => {
    render(<FieldRow label="담당자">Alice</FieldRow>);
    expect(screen.getByText('담당자')).toBeInTheDocument();
  });

  it('renders children value', () => {
    render(<FieldRow label="심각도">높음</FieldRow>);
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('value side has text-right class', () => {
    const { container } = render(<FieldRow label="라벨">값</FieldRow>);
    const value = container.querySelector('.text-right');
    expect(value).not.toBeNull();
  });

  it('applies custom className to row', () => {
    const { container } = render(<FieldRow label="l" className="custom-row">v</FieldRow>);
    expect(container.firstElementChild).toHaveClass('custom-row');
  });

  it('renders ReactNode children', () => {
    render(
      <FieldRow label="상태">
        <span data-testid="node-val">활성</span>
      </FieldRow>,
    );
    expect(screen.getByTestId('node-val')).toBeInTheDocument();
  });

  it('inside FieldList renders label as dt and value as dd of one dl', () => {
    const { container } = render(
      <FieldList>
        <FieldRow label="담당자">Alice</FieldRow>
        <FieldRow label="상태">활성</FieldRow>
      </FieldList>,
    );
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    expect(screen.getAllByRole('term').map((el) => el.textContent)).toEqual(['담당자', '상태']);
    expect(screen.getAllByRole('definition').map((el) => el.textContent)).toEqual(['Alice', '활성']);
    for (const el of [...screen.getAllByRole('term'), ...screen.getAllByRole('definition')]) {
      expect(dl?.contains(el)).toBe(true);
    }
  });

  it('keeps the property layout left-aligned inside FieldList', () => {
    render(<FieldList><FieldRow label="담당자" layout="property">Alice</FieldRow></FieldList>);
    expect(screen.getByRole('definition').closest('div')?.className).toContain('[&>dd]:text-left');
  });

  it('outside FieldList keeps span/div markup', () => {
    const { container } = render(<FieldRow label="담당자">Alice</FieldRow>);
    expect(container.querySelector('dt, dd, dl')).toBeNull();
    expect(container.querySelector('span')).toHaveTextContent('담당자');
  });

  it('detail layout draws the 9rem label column, divided rows and tabular value inside a FieldList (#891)', () => {
    const { container } = render(<FieldList><FieldRow layout="detail" label="단위">min</FieldRow></FieldList>);
    const row = container.querySelector('dl > div');
    expect(row).toHaveClass('grid', 'grid-cols-[9rem_1fr]', 'gap-3', 'border-b', 'border-border-subtle', 'py-1.5', 'text-sm', 'last:border-0');
    expect(container.querySelector('dt')).toHaveClass('min-w-0', 'break-words', 'text-text-muted');
    expect(container.querySelector('dd')).toHaveClass('tabular');
  });

  it('detail layout renders the value in mono when asked', () => {
    const { container } = render(<FieldList><FieldRow layout="detail" label="id" mono>x</FieldRow></FieldList>);
    expect(container.querySelector('dd')).toHaveClass('t-mono');
    expect(container.querySelector('dd')).not.toHaveClass('tabular');
  });

  it('detail layout folds a camelCase string label with <wbr> and keeps its text', () => {
    const { container } = render(<FieldList><FieldRow layout="detail" label="averageOfRatiosAllowed">true</FieldRow></FieldList>);
    const dt = container.querySelector('dt');
    expect(dt?.querySelectorAll('wbr')).toHaveLength(3);
    expect(dt).toHaveTextContent('averageOfRatiosAllowed');
  });

  it('detail layout leaves an element label as-is', () => {
    const { container } = render(<FieldList><FieldRow layout="detail" label={<span>소유 조직</span>}>MEM</FieldRow></FieldList>);
    expect(container.querySelector('dt')?.querySelector('wbr')).toBeNull();
    expect(container.querySelector('dt')).toHaveTextContent('소유 조직');
  });
});
