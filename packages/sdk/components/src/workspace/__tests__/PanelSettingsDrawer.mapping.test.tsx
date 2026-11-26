import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function setupSaveOwner(initial = chart(), props: Partial<PanelSettingsDrawerProps> = {}, reader?: PanelInstance) {
  const changed = vi.fn<(value: MenuViewPanels) => void>();
  const save = vi.fn<(value: MenuViewPanels) => void>();
  function Stage() {
    const [value, setValue] = useState<MenuViewPanels>({ version: 1, instances: [initial, publisher, ...(reader ? [reader] : [])] });
    const [validation, setValidation] = useState<{ reason?: PanelSettingsDrawerProps['title'] }>({});
    const [open, setOpen] = useState(true);
    return <I18nProvider><DetailPanelSlotProvider><Host />
      <button type="button" disabled={validation.reason !== undefined} onClick={() => save(value)}>저장</button>
      <button type="button" onClick={() => setValue(current => ({ ...current, instances: current.instances.map(panel => {
        if (panel.id !== initial.id || panel.source.kind !== 'chart') return panel;
        const { x, ...config } = panel.source.config;
        return { ...panel, source: { kind: 'chart', config: { x: { type: x.type, field: x.field }, ...config } } };
      }) }))}>동일 소스 다시 읽기</button>
      <button type="button" onClick={() => setValue(current => ({ ...current, instances: [chart({ kind: 'line', measure: 'rate', breakdown: 'equipment' }), ...current.instances.slice(1)] }))}>소스 교체</button>
      {reader && <button type="button" onClick={() => setValue(current => ({ ...current, instances: current.instances.map(panel => panel.id === reader.id ? { ...panel, inputs: [] } : panel) }))}>받는 연결 해제</button>}
      {open && <PanelSettingsDrawer title={{ ko: '차트', en: 'Chart' }} panel={value.instances[0]!} value={value} mapping={mapping}
        selectionOf={() => null} onClose={() => setOpen(false)} onChange={next => { changed(next); setValue(next); }}
        onValidationChange={reason => setValidation({ reason })} {...props} />}
    </DetailPanelSlotProvider></I18nProvider>;
  }
  return { changed, save, user: userEvent.setup(), ...render(<Stage />) };
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

it('blocks the caller’s Save while the kind draft is invalid and clears the block on correction or close', async () => {
  const { save, user } = setupSaveOwner(chart({ kind: 'line', measure: 'hours', breakdown: 'equipment', stack: 'stack' }));
  const saveButton = screen.getByRole<HTMLButtonElement>('button', { name: '저장' });
  await user.click(screen.getByRole('radio', { name: '막대' }));
  expect(saveButton.disabled).toBe(true);
  await user.click(saveButton);
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('radio', { name: '선' }));
  expect(saveButton.disabled).toBe(false);
  await user.click(saveButton);
  expect(save).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('radio', { name: '막대' }));
  expect(saveButton.disabled).toBe(true);
  await user.keyboard('{Escape}');
  expect(saveButton.disabled).toBe(false);
});

it('shows why a connection edit is blocked after clearing a required slot', async () => {
  const { changed, user } = setup();
  await user.click(screen.getByRole('button', { name: '가동 시간 지우기' }));
  await user.click(screen.getByRole('button', { name: '매핑' }));
  await user.click(screen.getByRole('radio', { name: '무시' }));
  expect(screen.getByRole('radio', { name: '거르기' }).getAttribute('aria-checked')).toBe('true');
  const reason = screen.getByRole('alert');
  expect(reason.textContent).toBe('지표와 기준을 고르세요');
  expect(reason.classList.contains('sr-only')).toBe(false);
  expect(changed).not.toHaveBeenCalled();
});

it.each(['Motion', '선'])('requires disconnecting a held reader before changing the output through %s', async choice => {
  const reader: PanelInstance = {
    ...declared, id: 'reader', inputs: [{ key: 'selection', from: 'chart-1.selection', mode: 'hold', value: { shape: 'set', values: ['EQ-01'] } }],
  };
  const initial = chart({ kind: 'bar', measure: 'hours', breakdown: 'equipment' });
  const { changed, user } = setupSaveOwner(initial, {}, reader);
  const control = () => screen.getByRole(choice === '선' ? 'radio' : 'button', { name: choice });
  await user.click(screen.getByRole('button', { name: '가동률' }));
  expect(changed.mock.lastCall?.[0].instances).toContain(reader);
  expect(changed.mock.lastCall?.[0].instances[0]?.outputs).toEqual(initial.outputs);
  await user.click(screen.getByRole('button', { name: '가동 시간' }));
  changed.mockClear();
  await user.click(control());
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toBe('이 선택을 받는 패널의 연결을 먼저 해제하세요.');
  await user.click(screen.getByRole('button', { name: '받는 연결 해제' }));
  // Choose back and retry the edit using the now-disconnected graph.
  await user.click(screen.getByRole(choice === '선' ? 'radio' : 'button', { name: choice === '선' ? '막대' : '장비' }));
  await user.click(control());
  expect(changed.mock.lastCall?.[0].instances[0]?.outputs).toEqual(choice === '선' ? [] : [{ key: 'selection', dimension: 'motion', shape: 'set' }]);
});

it('keeps an incomplete draft when the stored config is cloned and its keys reordered', async () => {
  const { baseElement, user } = setupSaveOwner();
  await user.click(screen.getByRole('button', { name: '가동 시간 지우기' }));
  await user.click(screen.getByRole('button', { name: '동일 소스 다시 읽기' }));
  expect(within(well(baseElement, 'measure')).getByText('여기에 놓기')).toBeTruthy();
});

it('clears a draft and its connection rejection when the stored source changes', async () => {
  const reason = { ko: '편집한 구성을 저장할 수 없습니다', en: 'Cannot save the edited configuration' };
  const { baseElement, user } = setupSaveOwner(chart(), { validateCandidate: () => reason });
  await user.click(screen.getByRole('radio', { name: '막대' }));
  await user.click(screen.getByRole('radio', { name: '무시' }));
  expect(screen.getByRole('alert').textContent).toBe(reason.ko);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '저장' }).disabled).toBe(true);
  await user.click(screen.getByRole('button', { name: '소스 교체' }));
  expect(within(well(baseElement, 'measure')).getByRole('button', { name: '가동률 지우기' })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '저장' }).disabled).toBe(false);
});

it.each([
  ['종류', '선', '막대'], ['받는 방식', '거르기', '강조만'], ['값 반영', '따라가기', '붙잡기'],
])('draws one outer border and keeps keyboard selection for %s', async (label, first, second) => {
  const { user } = setupSaveOwner(chart(), { selectionOf: () => ({ shape: 'set', values: ['EQ-01'] }) });
  const group = within(screen.getByRole('radiogroup', { name: label }));
  expect(screen.getByRole('radiogroup', { name: label }).classList.contains('border')).toBe(true);
  const start = group.getByRole('radio', { name: first });
  expect(start.classList.contains('border')).toBe(false);
  const target = group.getByRole('radio', { name: second });
  start.focus();
  await user.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(target);
  expect(target.getAttribute('aria-checked')).toBe('true');
});

it.each([
  ['declared breakdown label', mapping, undefined, '장비'],
  ['explicit label', mapping, () => ({ ko: '설비 선택', en: 'Asset selection' }), '설비 선택'],
  ['raw dimension', { ...mapping, fields: { ...fields, breakdowns: [] } }, undefined, 'equipment'],
] as const)('shows the %s for a published selection', (_case, mapping, outputLabel, label) => {
  setupSaveOwner(chart({ kind: 'bar', measure: 'hours', breakdown: 'equipment' }), { mapping, outputLabel });
  expect(screen.getByText(`내보내는 선택 · ${label}`)).toBeTruthy();
});

describe('mapping field drag', () => {
  let hit: Element | null;
  beforeEach(() => {
    hit = null;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
  });
  afterEach(() => { Reflect.deleteProperty(document, 'elementFromPoint'); });

  function pointer(target: HTMLElement | Window, type: string, clientX = 0) {
    fireEvent(target, Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }), {
      pointerId: 1, isPrimary: true,
    }));
  }

  function drag(chip: HTMLElement, target: HTMLElement) {
    pointer(chip, 'pointerdown');
    hit = target;
    pointer(chip, 'pointermove', 12);
  }

  it('outlines an accepting well and places a field in the empty slot', async () => {
    const { baseElement, changed, user } = setup();
    await user.click(screen.getByRole('button', { name: '가동 시간 지우기' }));
    const chip = screen.getByRole('button', { name: '가동률' });
    const measure = well(baseElement, 'measure');
    drag(chip, measure);
    expect(measure).toHaveClass('border-accent-primary');
    pointer(chip, 'pointerup', 12);
    expect(within(measure).getByRole('button', { name: '가동률 지우기' })).toBeTruthy();
    expect(changed).toHaveBeenCalledOnce();
  });

  it('keeps a press below the drag threshold on the shelf click path', () => {
    const { baseElement, changed } = setup();
    const chip = screen.getByRole('button', { name: 'Motion' });
    const target = well(baseElement, 'breakdown');
    pointer(chip, 'pointerdown');
    hit = target;
    pointer(chip, 'pointermove', 4);
    expect(target).not.toHaveClass('border-accent-primary');
    pointer(chip, 'pointerup', 4);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(chip, { detail: 1 });
    expect(within(target).getByRole('button', { name: 'Motion 지우기' })).toBeTruthy();
  });

  it.each([
    ['shelf', 'Motion', '이 지표는 이 기준으로 볼 수 없습니다'],
    ['well', '가동률', '기준 칸에는 기준만 놓을 수 있습니다'],
  ] as const)('shows the refusal reason for a chip from the %s and keeps the draft', (source, label, reason) => {
    const { baseElement, changed } = setup(chart({ kind: 'line', measure: 'rate', breakdown: 'equipment' }));
    const chip = source === 'shelf' ? screen.getByRole('button', { name: label }) : within(well(baseElement, 'measure')).getByText(label);
    const target = well(baseElement, 'breakdown');
    drag(chip, target);
    expect(target).toHaveAccessibleDescription(reason);
    pointer(chip, 'pointerup', 12);
    expect(target).not.toHaveAccessibleDescription(reason);
    expect(within(target).getByRole('button', { name: '장비 지우기' })).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(['click', 'Enter'] as const)('replaces the filled slot with the same result as %s assignment', async gesture => {
    const dragged = setup();
    const chip = screen.getByRole('button', { name: 'Motion' });
    const breakdown = well(dragged.baseElement, 'breakdown');
    drag(chip, breakdown);
    pointer(chip, 'pointerup', 12);
    expect(within(breakdown).queryByRole('button', { name: '장비 지우기' })).toBeNull();
    expect(within(breakdown).getByRole('button', { name: 'Motion 지우기' })).toBeTruthy();
    expect(within(well(dragged.baseElement, 'measure')).getByRole('button', { name: '가동 시간 지우기' })).toBeTruthy();
    dragged.unmount();
    const alternate = setup();
    const alternateChip = screen.getByRole('button', { name: 'Motion' });
    if (gesture === 'click') await alternate.user.click(alternateChip);
    else {
      alternateChip.focus();
      await alternate.user.keyboard('{Enter}');
    }
    expect(dragged.changed.mock.calls).toEqual(alternate.changed.mock.calls);
  });

  it('keeps the Save owner blocked when a dropped field fails candidate validation', () => {
    const reason = { ko: '편집한 구성을 저장할 수 없습니다', en: 'Cannot save the edited configuration' };
    const { baseElement, changed } = setupSaveOwner(chart(), { validateCandidate: () => reason });
    const chip = screen.getByRole('button', { name: 'Motion' });
    drag(chip, well(baseElement, 'breakdown'));
    pointer(chip, 'pointerup', 12);
    expect(screen.getByRole('alert')).toHaveTextContent(reason.ko);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'chip removed'])('cancels on %s without assigning the held chip', async reason => {
    const { baseElement, changed, user } = setup();
    const source = well(baseElement, 'measure');
    const target = well(baseElement, 'breakdown');
    const chip = reason === 'chip removed' ? within(source).getByText('가동 시간') : screen.getByRole('button', { name: 'Motion' });
    drag(chip, target);
    if (reason === 'chip removed') expect(target).toHaveAccessibleDescription('기준 칸에는 기준만 놓을 수 있습니다');
    else expect(target).toHaveClass('border-accent-primary');
    switch (reason) {
      case 'Escape':
        chip.focus();
        await user.keyboard('{Escape}');
        break;
      case 'chip removed':
        within(source).getByRole('button', { name: '가동 시간 지우기' }).focus();
        await user.keyboard('{Enter}');
        break;
      case 'blur':
        fireEvent.blur(window);
        break;
      default:
        pointer(chip, reason);
    }
    await waitFor(() => {
      expect(target).not.toHaveClass('border-accent-primary');
      expect(target).not.toHaveAccessibleDescription('기준 칸에는 기준만 놓을 수 있습니다');
    });
    pointer(chip.isConnected ? chip : window, 'pointerup', 12);
    if (reason === 'Escape') fireEvent.click(chip, { detail: 1 });
    expect(screen.getByRole('button', { name: '매핑' })).toBeTruthy();
    expect(within(target).getByRole('button', { name: '장비 지우기' })).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });

  it('asks for a retry if the well under the pointer changes before release', () => {
    const { baseElement, changed } = setup();
    const chip = screen.getByRole('button', { name: '가동률' });
    drag(chip, well(baseElement, 'breakdown'));
    hit = well(baseElement, 'measure');
    pointer(chip, 'pointerup', 12);
    fireEvent.click(chip, { detail: 1 });
    expect(screen.getByRole('status')).toHaveTextContent('놓는 위치가 바뀌었습니다. 다시 끌어 놓으세요.');
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(['lostpointercapture', 'blur'])('guards the cancelled release click after %s', async reason => {
    const { baseElement, changed, user } = setup();
    const chip = screen.getByRole('button', { name: 'Motion' });
    drag(chip, well(baseElement, 'breakdown'));
    if (reason === 'blur') fireEvent.blur(window);
    else pointer(chip, reason);
    pointer(chip, 'pointerup', 12);
    fireEvent.click(chip, { detail: 1 });
    expect(changed).not.toHaveBeenCalled();

    await user.click(chip);
    screen.getByRole('button', { name: '장비' }).focus();
    await user.keyboard('{Enter}');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['소스 교체', '가동률', 0], ['동일 소스 다시 읽기', '가동 시간', 1],
  ] as const)('checks the saved configuration during a drag after %s', (action, field, changes) => {
    const { baseElement, changed } = setupSaveOwner();
    fireEvent.click(screen.getByRole('button', { name: '가동 시간 지우기' }));
    const chip = screen.getByRole('button', { name: '가동 시간' });
    const target = well(baseElement, 'measure');
    drag(chip, target);
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(well(baseElement, 'measure')).toBe(target);
    const previewRetained = target.classList.contains('border-accent-primary');
    pointer(chip, 'pointerup', 12);
    fireEvent.click(chip, { detail: 1 });
    expect(changed).toHaveBeenCalledTimes(changes);
    expect(within(target).getByRole('button', { name: `${field} 지우기` })).toBeTruthy();
    expect(previewRetained).toBe(changes === 1);
  });

  it('clears the stale drop status when the saved configuration changes', () => {
    const { baseElement } = setupSaveOwner();
    const chip = screen.getByRole('button', { name: '가동률' });
    drag(chip, well(baseElement, 'breakdown'));
    hit = well(baseElement, 'measure');
    pointer(chip, 'pointerup', 12);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('다시 끌어 놓으세요.');
    fireEvent.click(screen.getByRole('button', { name: '소스 교체' }));
    expect(status).toBeEmptyDOMElement();
  });

  it.each(['shelf', 'well'])('announces a refused drop from the %s and keeps focus in the drawer', source => {
    const { baseElement, changed } = setup();
    const measure = well(baseElement, 'measure');
    const chip = source === 'shelf' ? screen.getByRole('button', { name: '가동 시간' }) : within(measure).getByText('가동 시간');
    const status = screen.getByRole('status');
    const focused = source === 'shelf' ? chip : measure;
    focused.focus();
    drag(chip, well(baseElement, 'breakdown'));
    if (source === 'well') focused.blur();
    expect(status).toBeEmptyDOMElement();
    pointer(chip, 'pointerup', 12);
    expect(status).toHaveTextContent('기준 칸에는 기준만 놓을 수 있습니다');
    expect(focused).toHaveFocus();
    expect(changed).not.toHaveBeenCalled();
  });

  it('dims a refusing well and displays its description below the assigned chip', () => {
    const { baseElement } = setup();
    const target = well(baseElement, 'breakdown');
    const reason = '기준 칸에는 기준만 놓을 수 있습니다';
    drag(screen.getByRole('button', { name: '가동 시간' }), target);
    expect(target).toHaveAccessibleDescription(reason);
    expect(within(target).getByText('장비')).toBeVisible();
    expect(target.nextElementSibling).toHaveTextContent(reason);
    expect(target).toHaveClass('bg-surface-canvas');
  });
});
