import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { VocDetailDrawer } from './VocDetailDrawer';

const state = vi.hoisted(() => ({ full: true, body: 'Loading state', close: vi.fn() }));
vi.mock('@ap/feature-screens/operator-screens/voc-detail', () => ({
  useVocDetailParts: () => ({
    title: 'VOC detail',
    body: <p>{state.body}</p>,
    requestClose: state.close,
    ...(state.full
      ? {
          renderRegions: (renderLayout: (layout: {
            regions: { body: ReactNode; properties: ReactNode; activity: ReactNode };
            footer: ReactNode;
            sections: Array<{ id: string; label: string }>;
          }) => ReactNode) =>
            renderLayout({
              regions: {
                body: <p>Description and author</p>,
                properties: <p>Assignee and severity</p>,
                activity: (
                  <>
                    <div data-anchor="compose" />
                    <p>Conversation</p>
                    <textarea aria-label="Composer" />
                  </>
                ),
              },
              footer: <button>Next action</button>,
              sections: [
                { id: 'overview', label: '요약' },
                { id: 'compose', label: '작성' },
              ],
            }),
        }
      : {}),
  }),
}));

function Host() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} />;
}

function mount() {
  return render(
    <I18nProvider>
      <DetailPanelSlotProvider>
        <Host />
        <VocDetailDrawer vocId="voc" onClose={() => {}} />
      </DetailPanelSlotProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  state.full = true;
  state.body = 'Loading state';
});

it('declares VOC regions and keeps the composer in activity and the action footer outside scrolling', () => {
  mount();

  expect(
    screen.getByText('Description and author')
      .closest('[data-detail-region]')?.getAttribute('data-detail-region'),
  ).toBe('body');
  expect(
    screen.getByText('Assignee and severity')
      .closest('[data-detail-region]')?.getAttribute('data-detail-region'),
  ).toBe('properties');
  expect(
    screen.getByLabelText('Composer')
      .closest('[data-detail-region]')?.getAttribute('data-detail-region'),
  ).toBe('activity');
  expect(
    screen.getByRole('button', { name: 'Next action' }).closest('[data-detail-main-scroll]'),
  ).toBeNull();
});

it.each(['Loading state', 'Failed state', 'Permission-limited state'])(
  'keeps the %s body wrapper and full width without an empty property track',
  (body) => {
    state.full = false;
    state.body = body;
    mount();

    const content = screen.getByText(body);
    expect(content.closest('[data-detail-region]')?.getAttribute('data-detail-region')).toBe('body');
    expect(content.closest('.fo-detail-body')?.className).toBe(
      'fo-detail-body flex min-h-0 flex-1 flex-col',
    );
    expect(document.querySelector('[data-detail-region="properties"]')).toBeNull();
  },
);

it('declares the section navigation above the shared scroll root and jumps to an activity anchor', () => {
  const scrolled: unknown[] = [];
  Element.prototype.scrollTo = function (this: Element) {
    scrolled.push(this);
  } as typeof Element.prototype.scrollTo;
  mount();

  const wrapper = document.querySelector('[data-detail-navigation]');
  const root = document.querySelector('[data-detail-main-scroll]') as HTMLElement;
  expect(wrapper?.classList.contains('@[60rem]/detail-panel:hidden')).toBe(true);
  expect(wrapper?.contains(screen.getByRole('navigation', { name: '섹션 이동' }))).toBe(true);
  root.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 100, width: 100, height: 400 }) as DOMRect;
  (document.querySelector('[data-anchor="compose"]') as HTMLElement).getBoundingClientRect = () =>
    ({ top: 900, bottom: 920, left: 0, right: 100, width: 100, height: 20 }) as DOMRect;
  fireEvent.click(screen.getByRole('button', { name: '작성' }));
  expect(scrolled.at(-1)).toBe(root);
});

it('declares no navigation when the body hands over no sections', () => {
  state.full = false;
  mount();
  expect(document.querySelector('[data-detail-navigation]')).toBeNull();
});
