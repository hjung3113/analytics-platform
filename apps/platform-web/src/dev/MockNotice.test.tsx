import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { createAssembly, type Assembly } from '#platform-assembly';
import { registry } from '../menus';
import { MockNotice } from './MockNotice';

afterEach(cleanup);
describe('mock sidebar notice (#2022)', () => {
  it('says the data is synthetic in the page language', () => {
    render(<I18nProvider><MockNotice /></I18nProvider>);
    expect(screen.getByText('통합 프로토타입 · 합성 데이터')).toBeTruthy();
  });
  it('is supplied by the mock assembly', async () => {
    const assembly = await createAssembly({ registry }) as Assembly;
    expect(assembly.sidebarNotice).toBeTruthy();
  });
});
