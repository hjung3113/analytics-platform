import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { DetailPanelSlotProvider, DirtyConfirmation, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer } from '../DetailDrawer';

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
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

/** The VOC detail's real discard confirm (the FeedbackOps `DirtyConfirmation`, a Radix AlertDialog) opened from the drawer's own close button. */
function Host() {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  return <>
    <button type="button" data-testid="opener" onClick={() => setOpen(true)}>행</button>
    {open && <DetailDrawer title="상세" onClose={() => setAsking(true)}
      tabs={[{ id: 'a', label: '상세', content: <>
        <textarea aria-label="작성" />
        <DirtyConfirmation open={asking} onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); setOpen(false); }} />
      </> }]} />}
  </>;
}

describe('DetailDrawer closing through a dialog it opened (UX-4)', () => {
  it('returns focus to the opener after the Radix discard confirm closes the drawer, once the dialog has finished its own focus return', async () => {
    render(tree(<Host />));
    const opener = screen.getByTestId('opener');
    opener.focus();
    fireEvent.click(opener);
    screen.getByLabelText('작성').focus();
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    fireEvent.click(await screen.findByRole('button', { name: '이동' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Radix FocusScope returns focus from a timer after unmount.
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(document.activeElement).toBe(opener);
  });
});
