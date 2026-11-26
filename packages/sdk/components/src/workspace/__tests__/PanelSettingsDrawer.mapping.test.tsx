import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { createChartPanel, menuPermission, type ChartPanelDraft, type MenuChartFields, type MenuViewPanels, type PanelInstance } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { PanelSettingsDrawer, type PanelSettingsDrawerProps } from '../../index';

const fields: MenuChartFields = {
  time: { field: 'day', label: { ko: '날짜', en: 'Date' } },
  measures: [
    { id: 'hours', label: { ko: '가동 시간', en: 'Run time' }, unit: 'h', reaggregation: 'sum' },
    { id: 'rate', label: { ko: '가동률', en: 'Utilization' }, unit: '%', reaggregation: 'none', breakdowns: ['equipment'] },
    { id: 'restricted', label: { ko: '제한 지표', en: 'Restricted measure' }, unit: 'h', reaggregation: 'sum', permission: menuPermission('restricted:read') },
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
const declared: PanelInstance = { id: 'chart-1', source: { kind: 'declared', panel: 'summary' }, inputs: [input], outputs: [] };

function chart(draft: ChartPanelDraft = { kind: 'line', measure: 'hours', breakdown: 'equipment' }): PanelInstance {
  const result = createChartPanel(fields, draft, 'chart-1', granted);
  if (result.status === 'problem') throw new Error(result.problem.code);
  return { ...result.instance, inputs: [input] };
}

function Host() {
  const { ref } = useDetailPanelSlotHost();
  return <aside ref={ref} />;
}

function setup(initial = chart(), props: Pick<PanelSettingsDrawerProps, 'mapping' | 'projectCandidate' | 'validateCandidate'> = { mapping }) {
  const changed = vi.fn<(value: MenuViewPanels) => void>();
  function Stage() {
    const [value, setValue] = useState<MenuViewPanels>({ version: 1, instances: [initial, publisher] });
    return <I18nProvider><DetailPanelSlotProvider><Host />
      <PanelSettingsDrawer title={{ ko: '차트', en: 'Chart' }} panel={value.instances[0]!} value={value} {...props}
        selectionOf={() => null} onClose={() => {}} onChange={next => { changed(next); setValue(next); }} />
    </DetailPanelSlotProvider></I18nProvider>;
  }
  return { changed, user: userEvent.setup(), ...render(<Stage />) };
}

function well(container: HTMLElement, slot: string) {
  const element = container.querySelector<HTMLElement>(`[data-mapping-slot="${slot}"]`);
  if (!element) throw new Error(`Missing ${slot} slot`);
  return element;
}

afterEach(cleanup);

it.each([['chart', chart(), {}], ['declared', declared, { mapping }]] as const)('keeps %s in the connections-only drawer unless mapping is enabled for a chart', (_kind, initial, props) => {
  const legacy = setup(initial, props);
  expect(screen.getAllByRole('button', { expanded: true }).map(button => button.textContent)).toEqual(['연결']);
  expect(screen.getByRole('radiogroup', { name: '받는 방식' })).toBeTruthy();
  expect(legacy.baseElement.querySelector('[data-mapping-slot]')).toBeNull();
  legacy.unmount();
  setup();
  const sections = screen.getAllByRole('button', { expanded: true }).map(button => button.textContent);
  expect(sections).toEqual(['매핑', '연결']);
});

it.each(['click', 'Enter', 'Space'] as const)('places a field with %s and emits the rebuilt instance with its input', async gesture => {
  const { baseElement, changed, user } = setup(chart({ kind: 'bar', measure: 'hours', breakdown: 'equipment' }));
  const motion = screen.getByRole('button', { name: 'Motion' });
  if (gesture === 'click') await user.click(motion);
  else {
    motion.focus();
    await user.keyboard(gesture === 'Enter' ? '{Enter}' : ' ');
  }
  expect(changed).toHaveBeenCalledExactlyOnceWith({ version: 1, instances: [{
    id: 'chart-1', inputs: [input], outputs: [{ key: 'selection', dimension: 'motion', shape: 'set' }],
    source: { kind: 'chart', config: { version: 1, kind: 'bar', x: { field: 'motion', type: 'category' }, measures: [{ field: 'hours' }] } },
  }, publisher] });
  expect(within(well(baseElement, 'breakdown')).getByRole('button', { name: 'Motion 지우기' })).toBeTruthy();
  expect(motion.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: '장비' }).getAttribute('aria-pressed')).toBe('false');
});

it('keeps an unavailable chip focusable, exposes its reason, and ignores activation', async () => {
  const { changed, user } = setup(chart({ kind: 'line', measure: 'rate', breakdown: 'equipment' }));
  const motion = screen.getByRole('button', { name: 'Motion' });
  expect(motion.getAttribute('aria-disabled')).toBe('true');
  motion.focus();
  expect(document.activeElement).toBe(motion);
  const reasonId = motion.getAttribute('aria-describedby')!;
  expect(document.getElementById(reasonId)?.textContent).toBe('이 지표는 이 기준으로 볼 수 없습니다');
  await user.keyboard('{Enter} ');
  await user.click(motion);
  expect(changed).not.toHaveBeenCalled();
});

it('clears the well and the shelf highlight until another measure is placed', async () => {
  const { baseElement, changed, user } = setup();
  await user.click(screen.getByRole('button', { name: '가동 시간 지우기' }));
  expect(within(well(baseElement, 'measure')).getByText('여기에 놓기')).toBeTruthy();
  const measure = screen.getByRole('button', { name: '가동 시간' });
  expect(measure.getAttribute('aria-pressed')).toBe('false');
  expect(changed).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '가동률' }));
  expect(changed.mock.lastCall?.[0].instances[0]?.source).toMatchObject({ config: { measures: [{ field: 'rate' }] } });
});

it('keeps and dims the breakdown when switching a stacked line to bar, and blocks saving', async () => {
  const validateCandidate = vi.fn();
  const { baseElement, changed, user } = setup(chart({ kind: 'line', measure: 'hours', breakdown: 'equipment', stack: 'stack' }), { mapping, validateCandidate });
  await user.click(screen.getByRole('radio', { name: '막대' }));
  const breakdown = well(baseElement, 'breakdown');
  expect(breakdown.getAttribute('aria-invalid')).toBe('true');
  expect(within(breakdown).getByRole('button', { name: '장비 지우기' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('막대 차트는 기준 값마다 막대 하나라 쌓을 수 없습니다');
  expect(screen.getByText('기준과 같음')).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  expect(validateCandidate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('radio', { name: '선' }));
  expect(breakdown.hasAttribute('aria-invalid')).toBe(false);
  expect(changed).toHaveBeenCalledOnce();
});

it('validates a rebuilt chart with the existing projected-candidate gate', async () => {
  const projectCandidate = vi.fn((panel: PanelInstance): MenuViewPanels => ({ version: 1, instances: [panel, publisher] }));
  const validateCandidate = vi.fn(() => ({ ko: '편집한 구성을 저장할 수 없습니다', en: 'Cannot save the edited configuration' }));
  const { changed, user } = setup(chart(), { mapping, projectCandidate, validateCandidate });
  await user.click(screen.getByRole('radio', { name: '막대' }));
  expect(projectCandidate.mock.lastCall?.[0]).toMatchObject({
    inputs: [input], outputs: [{ key: 'selection', dimension: 'equipment', shape: 'set' }], source: { config: { kind: 'bar' } },
  });
  expect(validateCandidate).toHaveBeenCalledExactlyOnceWith(projectCandidate.mock.results[0]?.value);
  expect(screen.getByRole('alert').textContent).toBe('편집한 구성을 저장할 수 없습니다');
  expect(changed).not.toHaveBeenCalled();
});

it('shows a disabled line kind and its time requirement when the menu has no time field', () => {
  setup(chart({ kind: 'bar', measure: 'hours', breakdown: 'equipment' }), { mapping: { fields: { ...fields, time: undefined }, granted } });
  expect(screen.getByRole('radio', { name: '선' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('선 차트는 시간 축이 있는 메뉴에서만 만들 수 있습니다')).toBeTruthy();
});

it('marks the wells and chips, while the X axis only exposes its explanation', () => {
  const { baseElement } = setup();
  expect([...baseElement.querySelectorAll('[data-mapping-slot]')].map(node => node.getAttribute('data-mapping-slot'))).toEqual(['measure', 'breakdown']);
  expect(screen.getByRole('button', { name: '가동 시간' }).dataset).toMatchObject({ mappingChip: 'hours', mappingChipKind: 'measure' });
  expect(screen.getByRole('button', { name: '장비' }).dataset).toMatchObject({ mappingChip: 'equipment', mappingChipKind: 'breakdown' });
  const axis = screen.getByRole('group', { name: 'X축', description: 'X축은 종류가 정함' });
  expect(within(axis).getByText('날짜')).toBeTruthy();
  expect(axis.hasAttribute('data-mapping-slot')).toBe(false);
});
