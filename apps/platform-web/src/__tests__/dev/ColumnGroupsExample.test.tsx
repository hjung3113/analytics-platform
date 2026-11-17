import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { createAssembly, type Assembly } from '#platform-assembly';
import { registry } from '../../menus';
import { EQUIPMENT_AXES } from '../../equipmentAxes';

afterEach(cleanup);
describe('column groups dev fixture', () => {
  it('opts into editing the declared groups in the Columns popover', async () => {
    const restore = stubCompactTableGeometry(1100);
    try {
      const assembly = await createAssembly({ registry }) as Assembly;
      render(<I18nProvider><PlatformProvider adapter={assembly.adapter} registry={registry} equipmentAxes={EQUIPMENT_AXES}>{assembly.topBarTools}</PlatformProvider></I18nProvider>);
      await userEvent.click(screen.getByRole('button', { name: '열 묶음 표 예시' }));
      await screen.findByRole('columnheader', { name: '설비 A' });
      await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
      expect(screen.getByRole('button', { name: '묶음 만들기' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '설비 A 메뉴' })).toBeTruthy();
    } finally { cleanup(); restore(); }
  });
  it('offers declared widths for A/B while C keeps label-only sizing', async () => {
    const restore = stubCompactTableGeometry(1100);
    try {
      const assembly = await createAssembly({ registry }) as Assembly;
      render(<I18nProvider><PlatformProvider adapter={assembly.adapter} registry={registry} equipmentAxes={EQUIPMENT_AXES}>{assembly.topBarTools}</PlatformProvider></I18nProvider>);
      await userEvent.click(screen.getByRole('button', { name: '열 묶음 표 예시' }));
      await userEvent.click(await screen.findByRole('radio', { name: '묶음 넓이 지정' }));
      const boxes = document.querySelectorAll('[data-column-group-clip]');
      expect(boxes.length).toBeGreaterThan(0);
      boxes.forEach(box => expect(box).toHaveStyle({ width: '320px' }));
      expect(document.querySelector('[data-column-group-clip][data-group-id=C]')).toBeNull();
      expect(screen.getByRole('columnheader', { name: '설비 A' })).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('columnheader', { name: '설비 C' })).not.toHaveAttribute('tabindex');
    } finally { cleanup(); restore(); }
  });
  it('switches between plain/grouped modes and marks a row through its action', async () => {
    const restore = stubCompactTableGeometry(1100);
    try {
      const assembly = await createAssembly({ registry }) as Assembly;
      render(<I18nProvider><PlatformProvider adapter={assembly.adapter} registry={registry} equipmentAxes={EQUIPMENT_AXES}>
        {assembly.topBarTools}
      </PlatformProvider></I18nProvider>);
      await userEvent.click(screen.getByRole('button', { name: '열 묶음 표 예시' }));
      expect(await screen.findByRole('columnheader', { name: '설비 A' })).toHaveAttribute('aria-colspan', '5');
      await userEvent.click(screen.getByRole('radio', { name: '묶음 없음' }));
      expect(screen.queryByRole('columnheader', { name: '설비 A' })).toBeNull();
      await userEvent.click((await screen.findAllByRole('button', { name: /행 표시/ }))[0]);
      expect(screen.getByRole('status')).toHaveTextContent('설비 01');
      await userEvent.click(screen.getByRole('radio', { name: '열 묶음' }));
      expect(await screen.findByRole('columnheader', { name: '설비 B' })).toHaveAttribute('aria-colspan', '5');
    } finally { cleanup(); restore(); }
  });
});
