import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer } from './DetailDrawer';

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{
    id: 'home', primary: true, group: groupId('overview'), label: { ko: 'home', en: 'home' }, description: { ko: '', en: '' }, path: '/', icon: House,
    permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const,
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
const tree = (ui: ReactNode) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>{ui}<SlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>;

/** A body that asks to confirm in a dialog portaled to `document.body`, as the VOC detail's discard confirm is. */
function Body({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  return <>
    <button type="button" onClick={() => setAsking(true)}>버리기</button>
    {asking && createPortal(<div role="alertdialog" aria-label="확인"><button type="button" onClick={onConfirm}>이동</button></div>, document.body)}
  </>;
}

function Host() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" data-testid="opener" onClick={() => setOpen(true)}>행</button>
    {open && <DetailDrawer title="상세" onClose={() => setOpen(false)} tabs={[{ id: 'a', label: '상세', content: <Body onConfirm={() => setOpen(false)} /> }]} />}
  </>;
}

describe('DetailDrawer closing through a dialog it opened (UX-4)', () => {
  it('returns focus to the opener after a confirm dialog portaled out of the panel closes the drawer, pointer or keyboard', () => {
    for (const pointer of [true, false]) {
      render(tree(<Host />));
      const opener = screen.getByTestId('opener');
      // The drawer opens from the focused opener; it claims the close button, remembering the opener.
      opener.focus();
      fireEvent.click(opener);
      fireEvent.click(screen.getByRole('button', { name: '버리기' }));
      const confirm = screen.getByRole('button', { name: '이동' });
      if (pointer) fireEvent.pointerDown(confirm);
      confirm.focus();
      fireEvent.click(confirm);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
      cleanup();
    }
  });
});
