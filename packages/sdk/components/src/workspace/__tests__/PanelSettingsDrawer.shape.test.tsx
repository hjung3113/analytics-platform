import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChartPanel, type ChartConfig, type ChartPanelDraft, type MenuChartFields, type MenuViewPanels, type PanelInstance } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { PanelSettingsDrawer, type PanelSettingsDrawerProps } from '../../index';

const fields: MenuChartFields = {
  time: { field: 'day', label: { ko: '날짜', en: 'Date' } },
  measures: [
    { id: 'hours', label: { ko: '가동 시간', en: 'Run time' }, unit: 'h', reaggregation: 'sum' },
    { id: 'rate', label: { ko: '가동률', en: 'Utilization' }, unit: '%', reaggregation: 'none', breakdowns: ['equipment'] },
  ],
  breakdowns: [
    { id: 'equipment', label: { ko: '장비', en: 'Equipment' }, dimension: 'equipment' },
    { id: 'motion', label: { ko: 'Motion', en: 'Motion' }, dimension: 'motion' },
  ],
};
const granted = () => false;
const mapping = { fields, granted };
const input = { key: 'selection', from: 'publisher.selection', mode: 'follow' } as const;
const publisher: PanelInstance = {
  id: 'publisher', source: { kind: 'declared', panel: 'summary' }, inputs: [],
  outputs: [{ key: 'selection', dimension: 'equipment', shape: 'set' }],
};
const lineDraft: ChartPanelDraft = { kind: 'line', measure: 'hours', breakdown: 'equipment' };
const barDraft: ChartPanelDraft = { kind: 'bar', measure: 'hours', breakdown: 'equipment' };
const lineConfig: ChartConfig = {
  version: 1, kind: 'line', x: { field: 'day', type: 'time' }, measures: [{ field: 'hours' }], split: { field: 'equipment' },
};
const barConfig: ChartConfig = {
  version: 1, kind: 'bar', x: { field: 'equipment', type: 'category' }, measures: [{ field: 'hours' }],
};
const barOutput = { key: 'selection', dimension: 'equipment', shape: 'set' } as const;

function chart(draft: ChartPanelDraft): PanelInstance {
  const result = createChartPanel(fields, draft, 'chart-1', granted);
  if (result.status === 'problem') throw new Error(result.problem.code);
  return { ...result.instance, inputs: [input] };
}

function Host() {
  const { ref } = useDetailPanelSlotHost();
  return <aside ref={ref} />;
}

function setup(initial = chart(lineDraft), props: Pick<PanelSettingsDrawerProps, 'mapping' | 'validateCandidate'> = { mapping }, extra: PanelInstance[] = []) {
  const changed = vi.fn<(value: MenuViewPanels) => void>();
  function Stage() {
    const [value, setValue] = useState<MenuViewPanels>({ version: 1, instances: [initial, publisher, ...extra] });
    return <I18nProvider><DetailPanelSlotProvider><Host />
      <PanelSettingsDrawer title={{ ko: '차트', en: 'Chart' }} panel={value.instances[0]!} value={value} {...props}
        selectionOf={() => null} onClose={() => {}} onChange={next => { changed(next); setValue(next); }} />
    </DetailPanelSlotProvider></I18nProvider>;
  }
  return { changed, user: userEvent.setup(), ...render(<Stage />) };
}

function savedConfig(changed: ReturnType<typeof setup>['changed']): ChartConfig {
  const panel = changed.mock.lastCall?.[0].instances[0];
  if (panel?.source.kind !== 'chart') throw new Error('expected a saved chart');
  return panel.source.config;
}

function row(name: string) {
  return screen.getByRole('radiogroup', { name });
}

afterEach(cleanup);

describe('shape section', () => {
  it('shows only line rows between mapping and connections', () => {
    setup();
    expect(screen.getAllByRole('button', { expanded: true }).map(button => button.textContent)).toEqual(['매핑', '모양', '연결']);
    expect(row('쌓기')).toBeTruthy();
    expect(row('영역 채우기')).toBeTruthy();
    expect(row('소수 자리')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: '막대 방향' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: '색 계열' })).toBeNull();
    expect(screen.queryByText('값 형식')).toBeNull();
  });

  it('shows only bar rows, with one ring and no border on the selected swatch', () => {
    setup(chart(barDraft));
    expect(row('막대 방향')).toBeTruthy();
    expect(row('색 계열')).toBeTruthy();
    expect(row('소수 자리')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: '쌓기' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: '영역 채우기' })).toBeNull();
    for (const [name, token] of [['색 1', 'bg-chart-series-1'], ['색 2', 'bg-chart-series-2'], ['색 3', 'bg-chart-series-3'], ['색 4', 'bg-chart-series-4']] as const) {
      const swatch = within(row('색 계열')).getByRole('radio', { name });
      expect(swatch.querySelector('span')?.className).toContain(token);
      expect(swatch.className).toContain('data-[state=on]:ring-2');
      expect(swatch.className).not.toMatch(/data-\[state=on\]:border/);
      expect(swatch.className.split(' ').some(tokenClass => tokenClass === 'border' || tokenClass.startsWith('border-'))).toBe(false);
    }
    expect(within(row('색 계열')).getByRole('radio', { name: '색 1' })).toHaveAttribute('aria-checked', 'true');
  });

  it.each([
    ['쌓기', '쌓기', lineDraft, { stack: 'stack' }],
    ['쌓기', '쌓기 없음', { ...lineDraft, stack: 'stack' }, {}],
    ['영역 채우기', '켬', lineDraft, { areaFill: true }],
    ['영역 채우기', '끔', lineDraft, { areaFill: false }],
    ['영역 채우기', '자동', { ...lineDraft, areaFill: true }, {}],
    ['소수 자리', '0', lineDraft, { valueFormat: { kind: 'number', decimals: 0 } }],
    ['소수 자리', '1', lineDraft, { valueFormat: { kind: 'number', decimals: 1 } }],
    ['소수 자리', '2', lineDraft, { valueFormat: { kind: 'number', decimals: 2 } }],
    ['소수 자리', '자동', { ...lineDraft, decimals: 2 }, {}],
  ] as const)('line %s / %s writes only that choice', async (group, option, draft, extra) => {
    const { changed, user } = setup(chart(draft));
    await user.click(within(row(group)).getByRole('radio', { name: option }));
    expect(savedConfig(changed)).toEqual({ ...lineConfig, ...extra });
  });

  it.each([
    ['막대 방향', '가로', barDraft, { orientation: 'horizontal' }],
    ['막대 방향', '세로', { ...barDraft, orientation: 'horizontal' }, {}],
    ['색 계열', '색 2', barDraft, { measures: [{ field: 'hours', color: 'chart-series-2' }] }],
    ['색 계열', '색 1', { ...barDraft, color: 'chart-series-2' }, {}],
    ['소수 자리', '0', barDraft, { valueFormat: { kind: 'number', decimals: 0 } }],
    ['소수 자리', '자동', { ...barDraft, decimals: 1 }, {}],
  ] as const)('bar %s / %s writes only that choice', async (group, option, draft, extra) => {
    const { changed, user } = setup(chart(draft));
    await user.click(within(row(group)).getByRole('radio', { name: option }));
    expect(savedConfig(changed)).toEqual({ ...barConfig, ...extra });
  });

  it('round-trips area fill through on, off, and auto', async () => {
    const { changed, user } = setup();
    const area = () => row('영역 채우기');
    await user.click(within(area()).getByRole('radio', { name: '켬' }));
    expect(savedConfig(changed)).toMatchObject({ areaFill: true });
    await user.click(within(area()).getByRole('radio', { name: '끔' }));
    expect(savedConfig(changed).areaFill).toBe(false);
    await user.click(within(area()).getByRole('radio', { name: '자동' }));
    expect(savedConfig(changed)).not.toHaveProperty('areaFill');
  });

  it('dims stack on a non-additive measure, keeps it reachable, and does not save it', async () => {
    const { changed, user } = setup(chart({ kind: 'line', measure: 'rate', breakdown: 'equipment' }));
    const stacked = within(row('쌓기')).getByRole('radio', { name: '쌓기' });
    const none = within(row('쌓기')).getByRole('radio', { name: '쌓기 없음' });
    expect(stacked).toHaveAttribute('aria-disabled', 'true');
    expect(stacked).not.toHaveAttribute('disabled');
    expect(none).not.toHaveAttribute('aria-disabled');
    expect(document.getElementById(stacked.getAttribute('aria-describedby')!)?.textContent).toBe('더할 수 없는 지표라 쌓을 수 없습니다');
    stacked.focus();
    expect(document.activeElement).toBe(stacked);
    await user.keyboard('{Enter}');
    await user.click(stacked);
    none.focus();
    await user.keyboard('{ArrowRight}');
    expect(stacked).toHaveFocus();
    expect(stacked).toHaveAttribute('aria-checked', 'false');
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps outputs and inputs when a bar shape changes', async () => {
    const reader: PanelInstance = {
      id: 'reader', source: { kind: 'declared', panel: 'summary' }, outputs: [],
      inputs: [{ key: 'selection', from: 'chart-1.selection', mode: 'follow' }],
    };
    const { changed, user } = setup(chart(barDraft), { mapping }, [reader]);
    await user.click(within(row('막대 방향')).getByRole('radio', { name: '가로' }));
    const saved = changed.mock.lastCall?.[0].instances ?? [];
    expect(saved[0]).toMatchObject({ inputs: [input], outputs: [barOutput], source: { config: { orientation: 'horizontal' } } });
    expect(saved.find(panel => panel.id === 'reader')?.inputs).toEqual(reader.inputs);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses one tab stop per row and arrows inside the row', async () => {
    const { user } = setup();
    const stack = row('쌓기');
    const area = row('영역 채우기');
    within(stack).getByRole('radio', { name: '쌓기 없음' }).focus();
    await user.tab();
    expect(area.contains(document.activeElement)).toBe(true);
    expect(within(stack).getByRole('radio', { name: '쌓기' })).not.toHaveFocus();
    within(row('영역 채우기')).getByRole('radio', { name: '자동' }).focus();
    await user.keyboard('{ArrowRight}');
    const off = within(row('영역 채우기')).getByRole('radio', { name: '끔' });
    expect(off).toHaveFocus();
    expect(off).toHaveAttribute('aria-checked', 'true');
    await user.tab();
    expect(row('소수 자리').contains(document.activeElement)).toBe(true);
  });

  it('omits the section when the drawer has no mapping', () => {
    const mapped = setup();
    expect(screen.getByRole('button', { name: '모양' })).toBeTruthy();
    mapped.unmount();
    setup(chart(lineDraft), {});
    expect(screen.queryByRole('button', { name: '모양' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: '쌓기' })).toBeNull();
    expect(screen.getByRole('button', { name: '연결' })).toBeTruthy();
  });

  it('shows a saved shape the draft cannot hold with the existing changed reason', async () => {
    const initial = chart(lineDraft);
    if (initial.source.kind !== 'chart') throw new Error('chart');
    const panel: PanelInstance = {
      ...initial,
      source: { kind: 'chart', config: { ...initial.source.config, valueFormat: { kind: 'percent' } } },
    };
    const { changed, user } = setup(panel);
    expect(screen.getByRole('button', { name: '모양' })).toBeTruthy();
    expect(row('영역 채우기')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('메뉴가 바뀌어 저장된 차트를 그대로 열 수 없습니다');
    await user.click(within(row('영역 채우기')).getByRole('radio', { name: '켬' }));
    expect(savedConfig(changed)).toMatchObject({ areaFill: true });
    expect(savedConfig(changed)).not.toHaveProperty('valueFormat');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names each color circle for screen readers and pointer hover, and moves the color with the arrow keys', async () => {
    const { changed, user } = setup(chart(barDraft));
    const swatches = within(row('색 계열')).getAllByRole('radio');
    expect(swatches.map(swatch => [swatch.getAttribute('aria-label'), swatch.getAttribute('title')])).toEqual([
      ['색 1', '색 1'], ['색 2', '색 2'], ['색 3', '색 3'], ['색 4', '색 4'],
    ]);
    swatches[0]!.focus();
    await user.keyboard('{ArrowRight}');
    const second = within(row('색 계열')).getByRole('radio', { name: '색 2' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-checked', 'true');
    expect(savedConfig(changed)).toMatchObject({ measures: [{ field: 'hours', color: 'chart-series-2' }] });
  });

  it('shows a candidate the menu rejects inside the shape section and does not save it', async () => {
    const validateCandidate = vi.fn(() => ({ ko: '편집한 구성을 저장할 수 없습니다', en: 'Cannot save the edited configuration' }));
    const { changed, user } = setup(chart(lineDraft), { mapping, validateCandidate });
    await user.click(within(row('영역 채우기')).getByRole('radio', { name: '켬' }));
    expect(validateCandidate).toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('편집한 구성을 저장할 수 없습니다');
    expect(row('영역 채우기').parentElement?.parentElement).toContainElement(alert);
  });
});
