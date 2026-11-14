// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import EqvStudio from './EqvStudio';
import { FIXTURE, createServer, mountAt, type Roles, type Server } from './test-support';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('@ap/kernel', async () => {
  const actual = await vi.importActual<typeof import('@ap/kernel')>('@ap/kernel');
  return { ...actual, usePlatform: () => ({ ...actual.usePlatform(), toast: notify }) };
});

// jsdom has no layout: a stand-in viewer lists the Components, reports selection and exposes the drag callback only when the screen passes it.
vi.mock('@eqv/renderer', async () => {
  const actual = await vi.importActual<typeof import('@eqv/renderer')>('@eqv/renderer');
  const React = await import('react');
  const Viewer = ({ layout, onSelectedChange, onComponentDrag }: { layout: { components: { id: string; transform: { x: number } }[] }; onSelectedChange?: (id: string | null) => void; onComponentDrag?: (d: { componentId: string; phase: string; dx: number; dy: number }) => void }) =>
    React.createElement('div', { 'data-testid': 'viewer', 'data-draggable': String(onComponentDrag !== undefined) },
      ...layout.components.map(c => React.createElement('button', { key: c.id, 'data-testid': `select-${c.id}`, onClick: () => onSelectedChange?.(c.id) }, c.id)),
      React.createElement('button', { key: 'move', 'data-testid': 'drag-move', onClick: () => onComponentDrag?.({ componentId: 'proc-a', phase: 'move', dx: 5, dy: 0 }) }, 'move'),
      React.createElement('button', { key: 'cancel', 'data-testid': 'drag-cancel', onClick: () => onComponentDrag?.({ componentId: 'proc-a', phase: 'cancel', dx: 0, dy: 0 }) }, 'cancel'),
      React.createElement('button', { key: 'end', 'data-testid': 'drag-end', onClick: () => onComponentDrag?.({ componentId: 'proc-a', phase: 'end', dx: 5, dy: 0 }) }, 'end'),
      React.createElement('output', { key: 'x', 'data-testid': 'proc-x' }, String(layout.components.find(c => c.id === 'proc-a')?.transform.x)));
  return { ...actual, TopViewer: Viewer };
});

class FakeResizeObserver {
  constructor(private readonly callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
  observe() { this.callback([{ contentRect: { width: 800, height: 600 } }]); }
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);
vi.setConfig({ testTimeout: 30000 });

let server: Server;
beforeEach(() => { server = createServer(); notify.mockClear(); });
afterEach(() => { cleanup(); });
const slow = { timeout: 8000 };

async function mount(role: Roles, search = '') {
  mountAt(server, role, <EqvStudio />, search);
  await screen.findByTestId('viewer', {}, slow);
}
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const maybe = (name: string | RegExp) => screen.queryByRole('button', { name });
const guidance = () => screen.getByLabelText('동작 안내');
const select = (id: string) => fireEvent.click(screen.getByTestId(`select-${id}`));
const rename = (value: string) => fireEvent.change(screen.getByLabelText('이름'), { target: { value } });
const writes = () => server.state.writes.map(w => ({ action: w.action, input: w.input as Record<string, unknown>, expectedVersion: w.expectedVersion }));
const title = () => screen.getByRole('heading', { level: 1 });

describe('permission matrix', () => {
  it('viewer: no edit, publish or promote control, read-only inspector, guidance names the read-only state', async () => {
    await mount('viewer');
    for (const name of ['초안 저장', 'Revision 게시', 'EV Template으로 승격', '가져오기', '내보내기', 'Component 추가', '실행 취소 · Ctrl/Cmd+Z']) expect(maybe(name), name).toBeNull();
    select('proc-a');
    expect(screen.queryByLabelText('이름')).toBeNull();
    expect(within(guidance()).getByText('조회 전용 · 선택과 속성 확인 가능')).toBeTruthy();
    expect(screen.getByTestId('viewer').getAttribute('data-draggable')).toBe('false');
  });

  it('edit only: editing works, publish and promote are visible but disabled with the reason in the guidance row', async () => {
    await mount('edit');
    expect(maybe('초안 저장')).toBeTruthy();
    expect(maybe('가져오기')).toBeTruthy();
    expect(maybe('Component 추가')).toBeTruthy();
    expect((button('Revision 게시') as HTMLButtonElement).disabled).toBe(true);
    expect((button('EV Template으로 승격') as HTMLButtonElement).disabled).toBe(true);
    expect(within(guidance()).getByText('Revision 게시·승격 권한이 없습니다.')).toBeTruthy();
    select('proc-a');
    rename('Edited');
    expect((button('초안 저장') as HTMLButtonElement).disabled).toBe(false);
  });

  it('publish only: no save or edit tool, the saved draft can be published, promote stays disabled on the draft', async () => {
    await mount('publish');
    for (const name of ['초안 저장', '가져오기', '내보내기', 'Component 추가']) expect(maybe(name), name).toBeNull();
    select('proc-a');
    expect(screen.queryByLabelText('이름')).toBeNull();
    expect((button('Revision 게시') as HTMLButtonElement).disabled).toBe(false);
    expect((button('EV Template으로 승격') as HTMLButtonElement).disabled).toBe(true);
    expect(within(guidance()).getByText('편집 권한 없음 · 기존 초안 게시 가능')).toBeTruthy();
  });

  it('edit and publish: save is disabled while clean, publish is enabled, the shortcuts are listed', async () => {
    await mount('both');
    expect((button('초안 저장') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Revision 게시') as HTMLButtonElement).disabled).toBe(false);
    expect(within(guidance()).getByText(/Alt\+화살표 이동/)).toBeTruthy();
    expect(within(guidance()).getByText('저장할 변경이 없습니다.')).toBeTruthy();
  });

  it('a server refusal (forbidden) shows an error and changes nothing', async () => {
    await mount('both');
    select('proc-a'); rename('Edited');
    server.state.refuse = { outcome: 'forbidden' };
    fireEvent.click(button('초안 저장'));
    expect(await screen.findByText('권한이 없어 저장하지 못했습니다.', {}, slow)).toBeTruthy();
    expect(server.state.drafts.get(FIXTURE.id)!.version).toBe(1);
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('Edited');
  });
});

describe('save', () => {
  it('saves at the draft version the author saw and shows the clean draft', async () => {
    await mount('both');
    select('proc-a'); rename('Edited');
    expect(within(title().parentElement!).getByText('저장 안 됨')).toBeTruthy();
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('초안을 저장했습니다', 'info'), slow);
    expect(writes()).toEqual([{ action: 'eqv.saveDraft', input: expect.objectContaining({ layoutId: FIXTURE.id }), expectedVersion: '1' }]);
    expect((writes()[0]!.input.document as typeof FIXTURE).components.find(c => c.id === 'proc-a')!.label).toBe('Edited');
    expect(server.state.drafts.get(FIXTURE.id)!.version).toBe(2);
    await waitFor(() => expect(within(title().parentElement!).getByText('초안')).toBeTruthy(), slow);
  });

  it('a conflict keeps the local edits, says so, and reloads the server draft only after a confirmation', async () => {
    await mount('both');
    select('proc-a'); rename('Mine');
    server.state.drafts.get(FIXTURE.id)!.version = 5;
    server.state.drafts.get(FIXTURE.id)!.document = { ...FIXTURE, name: 'Theirs' };
    fireEvent.click(button('초안 저장'));
    expect(await screen.findByText('다른 사용자가 먼저 저장했습니다', {}, slow)).toBeTruthy();
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('Mine');
    expect(server.state.drafts.get(FIXTURE.id)!.version).toBe(5);
    fireEvent.click(button(/서버 초안 다시 불러오기/));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '유지' }));
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('Mine');
    fireEvent.click(button(/서버 초안 다시 불러오기/));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(screen.queryByText('다른 사용자가 먼저 저장했습니다')).toBeNull(), slow);
    select('proc-a');
    await waitFor(() => expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('proc-a'), slow);
    expect(within(title().parentElement!).queryByText('저장 안 됨')).toBeNull();
  });

  it('a conflict reload refuses edits until the fresh draft arrives; the next save uses its version', async () => {
    await mount('both');
    select('proc-a'); rename('Mine');
    server.state.drafts.get(FIXTURE.id)!.version = 5;
    server.state.drafts.get(FIXTURE.id)!.document = { ...FIXTURE, name: 'Theirs' };
    fireEvent.click(button('초안 저장'));
    await screen.findByText('다른 사용자가 먼저 저장했습니다', {}, slow);
    let release = () => {};
    server.state.holdDrafts = new Promise<void>(resolve => { release = resolve; });
    fireEvent.click(button(/서버 초안 다시 불러오기/));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText('서버 초안을 불러오는 중입니다.', {}, slow)).toBeTruthy();
    select('proc-a');
    expect(screen.queryByLabelText('이름')).toBeNull();
    fireEvent.keyDown(screen.getByTestId('viewer'), { key: 'ArrowRight', altKey: true });
    expect((button('초안 저장') as HTMLButtonElement).disabled).toBe(true);
    release();
    await waitFor(() => expect(screen.queryByText('서버 초안을 불러오는 중입니다.')).toBeNull(), slow);
    select('proc-a');
    rename('Fresh');
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('초안을 저장했습니다', 'info'), slow);
    expect(writes().at(-1)).toMatchObject({ action: 'eqv.saveDraft', expectedVersion: '5' });
    expect(server.state.drafts.get(FIXTURE.id)!.version).toBe(6);
  });

  it('a failed conflict reload keeps the old document, offers a retry, and the retry succeeds', async () => {
    await mount('both');
    select('proc-a'); rename('Mine');
    server.state.drafts.get(FIXTURE.id)!.version = 5;
    fireEvent.click(button('초안 저장'));
    await screen.findByText('다른 사용자가 먼저 저장했습니다', {}, slow);
    server.state.failDrafts = true;
    fireEvent.click(button(/서버 초안 다시 불러오기/));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText('서버 초안을 불러오지 못했습니다', {}, slow)).toBeTruthy();
    expect(screen.getByTestId('viewer')).toBeTruthy();
    expect(screen.queryByLabelText('이름')).toBeNull();
    expect((button('초안 저장') as HTMLButtonElement).disabled).toBe(true);
    server.state.failDrafts = false;
    fireEvent.click(button('다시 시도'));
    await waitFor(() => expect(screen.queryByText('서버 초안을 불러오지 못했습니다')).toBeNull(), slow);
    await waitFor(() => expect(within(title().parentElement!).queryByText('저장 안 됨')).toBeNull(), slow);
    select('proc-a');
    await waitFor(() => expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('proc-a'), slow);
  });

  it('a failed Layout list refresh after a conflict keeps the editor, its edits and original version; retry recovers', async () => {
    await mount('both');
    select('proc-a'); rename('Mine');
    server.state.drafts.get(FIXTURE.id)!.version = 5;
    server.state.failLayouts = true;
    fireEvent.click(button('초안 저장'));
    expect(await screen.findByText('Layout 목록을 새로 읽지 못했습니다', {}, slow)).toBeTruthy();
    expect(screen.getByTestId('viewer')).toBeTruthy();
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('Mine');
    expect(within(title().parentElement!).getByText('저장 안 됨')).toBeTruthy();
    server.state.failLayouts = false;
    fireEvent.click(button('다시 시도'));
    await waitFor(() => expect(screen.queryByText('Layout 목록을 새로 읽지 못했습니다')).toBeNull(), slow);
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('Mine');
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(writes()).toHaveLength(2), slow);
    expect(writes()[1]).toMatchObject({ expectedVersion: '1' });
  });

  it('invalid shows the first field error and keeps the edits', async () => {
    await mount('both');
    select('proc-a'); rename('Mine');
    server.state.refuse = { outcome: 'invalid', fieldErrors: [{ path: ['document', 'components', '0', 'id'], code: 'duplicate-id' }] };
    fireEvent.click(button('초안 저장'));
    expect(await screen.findByText('document.components.0.id: duplicate-id', {}, slow)).toBeTruthy();
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('Mine');
  });
});

describe('delete', () => {
  it('confirming removes the Component and its dependent edges, dirties the draft, and undo restores them', async () => {
    await mount('both');
    select('proc-a');
    fireEvent.click(button('삭제'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(screen.queryByTestId('select-proc-a')).toBeNull());
    expect(within(title().parentElement!).getByText('저장 안 됨')).toBeTruthy();
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('초안을 저장했습니다', 'info'), slow);
    const saved = writes()[0]!.input.document as unknown as { components: { id: string }[]; physicalInterfaces: { id: string }[]; transferCapabilities: { id: string }[] };
    expect(saved.components.map(c => c.id)).not.toContain('proc-a');
    expect(saved.physicalInterfaces.map(i => i.id)).toEqual(['lp-a-hub-a']);
    expect(saved.transferCapabilities).toEqual([]);
    fireEvent.click(button('실행 취소 · Ctrl/Cmd+Z'));
    expect(screen.getByTestId('select-proc-a')).toBeTruthy();
    expect(within(title().parentElement!).getByText('저장 안 됨')).toBeTruthy();
  });
});

describe('import', () => {
  const file = (doc: unknown) => new File([JSON.stringify(doc)], 'x.layout.json', { type: 'application/json' });
  it('makes no server write until 초안 저장; a new id saves at expected version 0', async () => {
    await mount('edit');
    const before = server.state.queries.length;
    const input = screen.getByTestId('layout-import-input');
    fireEvent.change(input, { target: { files: [file({ ...FIXTURE, id: 'brand-new', name: 'Brand new' })] } });
    await waitFor(() => expect(title().textContent).toContain('brand-new'), slow);
    expect(server.state.writes).toEqual([]);
    expect(server.state.queries.length).toBeGreaterThan(before);
    expect(await screen.findByText('저장 안 됨', {}, slow)).toBeTruthy();
    await waitFor(() => expect((button('초안 저장') as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('초안을 저장했습니다', 'info'), slow);
    expect(writes()).toEqual([{ action: 'eqv.saveDraft', input: expect.objectContaining({ layoutId: 'brand-new' }), expectedVersion: '0' }]);
    expect(server.state.drafts.get('brand-new')!.version).toBe(1);
  });

  it('an import of the open Layout replaces the draft as an unsaved edit at its version', async () => {
    await mount('edit');
    fireEvent.change(screen.getByTestId('layout-import-input'), { target: { files: [file({ ...FIXTURE, name: 'Imported name' })] } });
    expect(await screen.findByText('저장 안 됨', {}, slow)).toBeTruthy();
    expect(server.state.writes).toEqual([]);
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('초안을 저장했습니다', 'info'), slow);
    expect(writes()[0]).toMatchObject({ expectedVersion: '1' });
  });

  it('a file that fails validateLayout shows the reason and opens nothing', async () => {
    await mount('edit');
    fireEvent.change(screen.getByTestId('layout-import-input'), { target: { files: [file({ id: 'nope' })] } });
    expect(await screen.findByText('가져오기 실패', {}, slow)).toBeTruthy();
    expect(within(title().parentElement!).queryByText('저장 안 됨')).toBeNull();
  });

  it('is offered to an editor in the empty state when there is no Layout, and not to a viewer', async () => {
    server.state.drafts.clear();
    mountAt(server, 'viewer', <EqvStudio />);
    expect(await screen.findByText('Layout이 없습니다', {}, slow)).toBeTruthy();
    expect(maybe('가져오기')).toBeNull();
    cleanup();
    mountAt(server, 'edit', <EqvStudio />);
    expect(await screen.findByRole('button', { name: '가져오기' }, slow)).toBeTruthy();
  });
});

describe('publish', () => {
  it('is blocked while dirty with the reason; the dialog shows the first Revision and writes at the draft version', async () => {
    await mount('both');
    select('proc-a'); rename('Edited');
    expect((button('Revision 게시') as HTMLButtonElement).disabled).toBe(true);
    expect(within(guidance()).getByText('저장 후 게시 가능')).toBeTruthy();
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('초안을 저장했습니다', 'info'), slow);
    await waitFor(() => expect((button('Revision 게시') as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(button('Revision 게시'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('첫 Revision')).toBeTruthy();
    expect(within(dialog).getByText(/게시한 Revision은 바꿀 수 없습니다/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Revision을 게시했습니다', 'info'), slow);
    expect(writes().at(-1)).toEqual({ action: 'eqv.publishRevision', input: { layoutId: FIXTURE.id }, expectedVersion: '2' });
  });

  it('status: published after the refetch, changed after publishing and saving again', async () => {
    await mount('both');
    const badge = () => within(title().parentElement!);
    await waitFor(() => expect(badge().getByText('초안')).toBeTruthy(), slow);
    fireEvent.click(button('Revision 게시'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(badge().getByText('게시됨')).toBeTruthy(), slow);
    select('proc-a'); rename('Again');
    expect(badge().getByText('저장 안 됨')).toBeTruthy();
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(badge().getByText('게시 후 변경됨')).toBeTruthy(), slow);
  });

  it('shows no status before the Revision reads have answered, then published when the draft equals the latest Revision', async () => {
    let release = () => {};
    server.state.holdReads = new Promise<void>(resolve => { release = resolve; });
    server.state.revisions.push({ id: 'rev-0', layoutId: FIXTURE.id, revision: `sha256:${'a'.repeat(64)}`, document: { ...structuredClone(FIXTURE) }, publishedAt: '2026-11-10T01:00:00.000Z' });
    mountAt(server, 'both', <EqvStudio />);
    await screen.findByTestId('viewer', {}, slow);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(title().textContent).toBe(FIXTURE.id);
    expect(screen.queryByText('게시됨', { selector: 'span.t-badge' })).toBeNull();
    release();
    await waitFor(() => expect(within(title().parentElement!).getByText('게시됨')).toBeTruthy(), slow);
  });

  it('compares documents without regard to key order', async () => {
    const reordered = Object.fromEntries(Object.entries(FIXTURE).reverse());
    server.state.revisions.push({ id: 'rev-0', layoutId: FIXTURE.id, revision: `sha256:${'a'.repeat(64)}`, document: reordered, publishedAt: '2026-11-10T01:00:00.000Z' });
    mountAt(server, 'both', <EqvStudio />);
    await waitFor(() => expect(within(title().parentElement!).getByText('게시됨')).toBeTruthy(), slow);
  });

  it('the same document again answers created false and says the Revision exists; two Revisions give the unpinned case', async () => {
    server.state.revisions.push({ id: 'rev-0', layoutId: FIXTURE.id, revision: `sha256:${'a'.repeat(64)}`, document: { ...FIXTURE, name: 'Older' }, publishedAt: '2026-11-10T01:00:00.000Z' });
    server.state.revisions.push({ id: 'rev-9', layoutId: FIXTURE.id, revision: `sha256:${'b'.repeat(64)}`, document: { ...FIXTURE, name: 'Old' }, publishedAt: '2026-11-10T01:01:00.000Z' });
    await mount('both');
    fireEvent.click(button('Revision 게시'));
    const first = await screen.findByRole('alertdialog');
    expect(await within(first).findByText('기존 Revision 2개', {}, slow)).toBeTruthy();
    fireEvent.click(within(first).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Revision을 게시했습니다', 'info'), slow);
    fireEvent.click(await screen.findByRole('button', { name: 'Revision 게시' }));
    const second = await screen.findByRole('alertdialog');
    expect(await within(second).findByText(/이미 .*로 게시되어 있습니다/, {}, slow)).toBeTruthy();
    fireEvent.click(within(second).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('같은 내용의 Revision이 이미 있습니다. 새로 만들지 않았습니다', 'info'), slow);
    expect(server.state.revisions).toHaveLength(3);
  });

  it('a stale draft version on publish is a conflict with the reload path', async () => {
    await mount('both');
    server.state.drafts.get(FIXTURE.id)!.version = 4;
    fireEvent.click(button('Revision 게시'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '게시' }));
    expect((await screen.findAllByText('다른 사용자가 먼저 저장했습니다.', {}, slow)).length).toBeGreaterThan(0);
    expect(server.state.revisions).toEqual([]);
  });

  it('lists published Revisions with a short hash and the publish time in the history', async () => {
    server.state.revisions.push({ id: 'rev-0', layoutId: FIXTURE.id, revision: `sha256:${'c'.repeat(64)}`, document: structuredClone(FIXTURE), publishedAt: '2026-11-10T01:02:00.000Z' });
    await mount('both');
    expect(await screen.findByText('cccccccccccc', {}, slow)).toBeTruthy();
    expect(screen.getByText('2026-11-10 10:02')).toBeTruthy();
  });
});

describe('promote', () => {
  const REVISION = `sha256:${'d'.repeat(64)}`;
  const seedRevision = () => server.state.revisions.push({ id: 'rev-0', layoutId: FIXTURE.id, revision: REVISION, document: structuredClone(FIXTURE), publishedAt: '2026-11-10T01:02:00.000Z' });

  it('is blocked on the draft with the reason', async () => {
    seedRevision();
    await mount('both');
    expect((button('EV Template으로 승격') as HTMLButtonElement).disabled).toBe(true);
    expect(within(guidance()).getByText('EV Template 승격 대상: 게시된 Revision')).toBeTruthy();
  });

  it('on a published Revision: validates the id, shows the source and role counts, and promotes', async () => {
    seedRevision();
    await mount('both', `&revision=${REVISION}`);
    await waitFor(() => expect((button('EV Template으로 승격') as HTMLButtonElement).disabled).toBe(false), slow);
    expect(maybe('초안 저장')).toBeNull();
    fireEvent.click(button('EV Template으로 승격'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/삭제할 수 없습니다/)).toBeTruthy();
    expect(within(dialog).getByText(/lp 1/)).toBeTruthy();
    const submit = within(dialog).getByRole('button', { name: '승격' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^ID/), { target: { value: 'Bad_Id' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('하이픈');
    fireEvent.change(within(dialog).getByLabelText(/^ID/), { target: { value: 'my-template' } });
    fireEvent.change(within(dialog).getByLabelText(/^이름/), { target: { value: 'My template' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('EV Template my-template 승격 완료 · 삭제 불가', 'info'), slow);
    expect(writes().at(-1)).toEqual({ action: 'eqv.promoteTemplate', input: { layoutId: FIXTURE.id, revision: REVISION, templateId: 'my-template', name: 'My template' }, expectedVersion: undefined });
    expect(await screen.findByText('my-template', {}, slow)).toBeTruthy();
  });

  it('a server duplicate or bundled id error shows on the id field', async () => {
    seedRevision();
    server.state.templates.push({ id: 'tpl-0', templateId: 'taken', name: 'Taken', promotedFromLayoutId: FIXTURE.id, promotedFromRevision: REVISION, document: {}, createdAt: '2026-11-10T00:00:00.000Z' });
    await mount('both', `&revision=${REVISION}`);
    await waitFor(() => expect((button('EV Template으로 승격') as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(button('EV Template으로 승격'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(/^ID/), { target: { value: 'taken' } });
    fireEvent.change(within(dialog).getByLabelText(/^이름/), { target: { value: 'Again' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '승격' }));
    expect(await within(dialog).findByText('이미 사용 중인 EV Template id입니다.', {}, slow)).toBeTruthy();
    server.state.refuse = { outcome: 'invalid', fieldErrors: [{ path: ['templateId'], code: 'bundled_template_id' }] };
    fireEvent.change(within(dialog).getByLabelText(/^ID/), { target: { value: 'cluster-single' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '승격' }));
    expect(await within(dialog).findByText('기본 제공 EV Template id는 사용할 수 없습니다.', {}, slow)).toBeTruthy();
  });

  it('an EV Template opens read-only with its note, and the list says when there is none', async () => {
    await mount('both');
    expect(await screen.findByText('승격된 EV Template이 없습니다', {}, slow)).toBeTruthy();
    cleanup();
    server.state.templates.push({ id: 'tpl-0', templateId: 'taken', name: 'Taken', promotedFromLayoutId: FIXTURE.id, promotedFromRevision: REVISION, document: { ...structuredClone(FIXTURE), kind: 'template', id: 'taken', roleCardinality: { lp: { min: 1, max: 1 }, tm: { min: 1, max: 1 }, pm: { min: 1, max: 1 }, robot: { min: 1, max: 1 } } }, createdAt: '2026-11-10T00:00:00.000Z' });
    delete (server.state.templates[0]!.document as Record<string, unknown>).templateId;
    await mount('both', '&template=taken');
    expect(await within(guidance()).findByText('EV Template · 읽기 전용', {}, slow)).toBeTruthy();
    expect(maybe('Revision 게시')).toBeNull();
    expect(screen.getByRole('button', { name: '초안으로 돌아가기' })).toBeTruthy();
  });
});

describe('drag', () => {
  it('a drag ends as one undoable move', async () => {
    await mount('both');
    expect(screen.getByTestId('viewer').getAttribute('data-draggable')).toBe('true');
    const x = () => Number(screen.getByTestId('proc-x').textContent);
    const start = x();
    fireEvent.click(screen.getByTestId('drag-move'));
    fireEvent.click(screen.getByTestId('drag-move'));
    expect(x()).not.toBe(start);
    fireEvent.click(screen.getByTestId('drag-end'));
    expect(x()).not.toBe(start);
    fireEvent.click(button('실행 취소 · Ctrl/Cmd+Z'));
    expect(x()).toBe(start);
    expect((button('실행 취소 · Ctrl/Cmd+Z') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a cancelled drag leaves nothing to undo', async () => {
    await mount('both');
    const start = Number(screen.getByTestId('proc-x').textContent);
    fireEvent.click(screen.getByTestId('drag-move'));
    fireEvent.click(screen.getByTestId('drag-cancel'));
    expect(Number(screen.getByTestId('proc-x').textContent)).toBe(start);
    expect((button('실행 취소 · Ctrl/Cmd+Z') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([['a viewer', 'viewer', ''], ['a published Revision', 'both', `&revision=sha256:${'e'.repeat(64)}`]] as const)('is ignored for %s', async (_name, role, search) => {
    server.state.revisions.push({ id: 'rev-0', layoutId: FIXTURE.id, revision: `sha256:${'e'.repeat(64)}`, document: structuredClone(FIXTURE), publishedAt: '2026-11-10T01:02:00.000Z' });
    await mount(role, search);
    expect(screen.getByTestId('viewer').getAttribute('data-draggable')).toBe('false');
    const start = screen.getByTestId('proc-x').textContent;
    fireEvent.click(screen.getByTestId('drag-move'));
    fireEvent.click(screen.getByTestId('drag-end'));
    expect(screen.getByTestId('proc-x').textContent).toBe(start);
  });
});

describe('keyboard', () => {
  it('Alt+arrow nudges, ] rotates and Ctrl+Z undoes, but not while typing in an input', async () => {
    await mount('both');
    select('proc-a');
    const viewer = screen.getByTestId('viewer');
    fireEvent.keyDown(viewer, { key: 'ArrowRight', altKey: true });
    expect(within(title().parentElement!).getByText('저장 안 됨')).toBeTruthy();
    fireEvent.keyDown(viewer, { key: 'z', ctrlKey: true });
    expect(within(title().parentElement!).queryByText('저장 안 됨')).toBeNull();
    fireEvent.keyDown(screen.getByLabelText('이름'), { key: 'ArrowRight', altKey: true });
    expect(within(title().parentElement!).queryByText('저장 안 됨')).toBeNull();
    fireEvent.keyDown(viewer, { key: ']' });
    expect(within(title().parentElement!).getByText('저장 안 됨')).toBeTruthy();
  });
});

describe('page keys', () => {
  it('rejects a malformed revision key and recovers by clearing it', async () => {
    mountAt(server, 'both', <EqvStudio />, '&revision=nope');
    expect(await screen.findByText(/nope/, {}, slow)).toBeTruthy();
    expect(screen.queryByTestId('viewer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /초기화|Reset/ }));
    await screen.findByTestId('viewer', {}, slow);
    expect(new URLSearchParams(window.location.search).get('revision')).toBeNull();
  });
});

// FIX2 regressions use the existing screen mount and server; only the selected read is intercepted.
describe('FIX2 review regressions', () => {
  const revision = `sha256:${'e'.repeat(64)}`;
  const seedRevision = () => server.state.revisions.push({ id: 'fix2-rev', layoutId: FIXTURE.id, revision, document: structuredClone(FIXTURE), publishedAt: '2026-11-10T01:02:00.000Z' });
  const tab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

  it.each(['revision', 'template'] as const)('opening a %s pins the default Layout in the address', async kind => {
    seedRevision();
    server.state.templates.push({ id: 'fix2-template', templateId: 'test-template', name: 'Test', promotedFromLayoutId: FIXTURE.id, promotedFromRevision: revision, document: { ...FIXTURE, kind: 'template' }, createdAt: '2026-11-10T00:00:00.000Z' });
    await mount('both');
    const section = screen.getByRole('region', { name: kind === 'revision' ? 'Revision 이력' : 'EV Templates' });
    fireEvent.click(await within(section).findByRole('button', { name: kind === 'revision' ? /eeeeeeeeeeee/ : 'test-template' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('layout')).toBe(FIXTURE.id));
    expect(new URLSearchParams(window.location.search).get(kind)).toBe(kind === 'revision' ? revision : 'test-template');
  });

  it.each([
    ['eqv.layoutRevisions', 'Revision 이력', '게시된 Revision이 없습니다'],
    ['eqv.templates', 'EV Templates', '승격된 EV Template이 없습니다'],
  ])('%s distinguishes pending, failed, retrying and successful empty reads', async (endpoint, label, emptyText) => {
    const query = server.query;
    let release = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    let failing = true;
    let holding = true;
    vi.spyOn(server, 'query').mockImplementation(async req => {
      if (req.endpoint === endpoint) {
        if (holding) await held;
        if (failing) throw new Error('isolated list failure');
      }
      return query(req);
    });
    await mount('both');
    const section = within(screen.getByRole('region', { name: label }));
    expect(section.getByRole('status')).toBeTruthy();
    expect(section.queryByText(emptyText)).toBeNull();
    holding = false; release();
    const retry = await section.findByRole('button', { name: '다시 시도' });
    expect(section.queryByText(emptyText)).toBeNull();
    failing = false;
    fireEvent.click(retry);
    expect(await section.findByText(emptyText)).toBeTruthy();
    expect(section.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  it.each([
    ['eqv.layoutRevisions', 'error'], ['eqv.layoutRevisions', 'forbidden'],
    ['eqv.layoutRevision', 'error'], ['eqv.layoutRevision', 'forbidden'],
    ['eqv.layoutRevision', 'empty'], ['eqv.layoutRevision', 'invalid'],
  ] as const)('publish baseline recovers from %s %s instead of waiting forever', async (endpoint, failure) => {
    seedRevision();
    const query = server.query;
    let failing = true;
    let releaseRetry = () => {};
    const heldRetry = new Promise<void>(resolve => { releaseRetry = resolve; });
    vi.spyOn(server, 'query').mockImplementation(async req => {
      if (req.endpoint === endpoint && !failing) await heldRetry;
      if (req.endpoint === endpoint && failing) {
        if (failure === 'error') throw new Error('baseline read failure');
        if (failure === 'invalid') {
          const result = await query(req);
          return { ...result, data: { document: {} } } as unknown as Awaited<ReturnType<typeof query>>;
        }
        return { outcome: failure, data: null, assessments: [], trust: null, correlationId: 'fixture' };
      }
      return query(req);
    });
    await mount('both');
    fireEvent.click(button('Revision 게시'));
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(await dialog.findByText('비교 기준을 불러오지 못했습니다')).toBeTruthy();
    expect(dialog.queryByText('비교 기준을 확인하는 중…')).toBeNull();
    expect((dialog.getByRole('button', { name: '게시' }) as HTMLButtonElement).disabled).toBe(true);
    failing = false;
    fireEvent.click(dialog.getByRole('button', { name: '다시 시도' }));
    try {
      expect(await dialog.findByText('비교 기준을 확인하는 중…')).toBeTruthy();
      expect((dialog.getByRole('button', { name: '게시' }) as HTMLButtonElement).disabled).toBe(true);
    } finally { releaseRetry(); }
    await waitFor(() => expect((dialog.getByRole('button', { name: '게시' }) as HTMLButtonElement).disabled).toBe(false));
    expect(dialog.queryByText('비교 기준을 불러오지 못했습니다')).toBeNull();
  });

  it('Alt+ArrowDown bubbles from the outline to nudge without changing selection', async () => {
    await mount('both');
    select('hub-a');
    const before = Number((screen.getByLabelText('Y') as HTMLInputElement).value);
    tab('구성');
    const hub = screen.getByRole('treeitem', { name: /hub-a/ });
    hub.focus();
    fireEvent.keyDown(hub, { key: 'ArrowDown', altKey: true });
    expect(hub.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(hub);
    tab('속성');
    expect(Number((screen.getByLabelText('Y') as HTMLInputElement).value)).toBeGreaterThan(before);
  });

  it('renders and navigates one depth-first Component order', async () => {
    await mount('both');
    select('hub-a'); tab('구성');
    const items = screen.getAllByRole('treeitem');
    expect(items.map(item => item.querySelector('span')?.textContent)).toEqual(['lp-a', 'hub-a', 'arm-a', 'proc-a']);
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /hub-a/ }), { key: 'ArrowDown' });
    expect(screen.getByRole('treeitem', { name: /arm-a/ }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /arm-a/ }));
  });

  it('pending drafts show loading without zero counts or absence/clean claims', async () => {
    let release = () => {};
    server.state.holdDrafts = new Promise<void>(resolve => { release = resolve; });
    mountAt(server, 'both', <EqvStudio />);
    await screen.findByTestId('layouts-editor');
    try {
      expect(screen.queryByText('0 Components')).toBeNull();
      expect(screen.queryByText('저장한 초안이 없습니다.')).toBeNull();
      expect(screen.queryByText('저장할 변경이 없습니다.')).toBeNull();
      expect(screen.getByRole('toolbar', { name: '편집 도구' }).textContent).toContain('불러오는 중');
      expect((button('초안 저장') as HTMLButtonElement).disabled).toBe(true);
      expect((button('Revision 게시') as HTMLButtonElement).disabled).toBe(true);
    } finally { release(); }
    await screen.findByTestId('viewer');
    expect(screen.getByText(`${FIXTURE.components.length} Components`)).toBeTruthy();
  });

  it('cancelling Delete retains the trigger and returns keyboard focus to it', async () => {
    await mount('both'); select('proc-a');
    const trigger = button('삭제'); trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole('alertdialog');
    expect(trigger.isConnected).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByTestId('select-proc-a')).toBeTruthy();
  });

  it('one save conflict renders only one amber callout', async () => {
    await mount('both'); select('proc-a'); rename('Mine');
    server.state.drafts.get(FIXTURE.id)!.version = 5;
    fireEvent.click(button('초안 저장'));
    await screen.findByText('다른 사용자가 먼저 저장했습니다');
    expect(screen.queryByText('다른 사용자가 먼저 저장했습니다.')).toBeNull();
    expect(screen.getAllByText(/다른 사용자가 먼저 저장했습니다/)).toHaveLength(1);
  });

  it('success is delivered to the platform toast and leaves no inline success strip', async () => {
    notify.mockClear();
    await mount('both'); select('proc-a'); rename('Toast');
    fireEvent.click(button('초안 저장'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('초안을 저장했습니다', 'info'));
    expect(screen.queryByText('초안을 저장했습니다')).toBeNull();
  });

  it('tool reasons stay accessible through descriptions without filling the guidance row', async () => {
    await mount('both');
    for (const [name, id] of [['실행 취소 · Ctrl/Cmd+Z', 'undo-reason'], ['다시 실행 · Ctrl/Cmd+Shift+Z', 'redo-reason'], ['왼쪽으로 15° 회전 · [', 'selection-reason']]) {
      expect(button(name!).getAttribute('aria-describedby')).toBe(id);
      expect(document.getElementById(id!)?.classList.contains('sr-only')).toBe(true);
    }
    expect(within(guidance()).getByText('저장할 변경이 없습니다.').classList.contains('sr-only')).toBe(false);
  });

  it('an imported Layout absent from the server list still has its current row', async () => {
    await mount('both');
    fireEvent.change(screen.getByTestId('layout-import-input'), { target: { files: [new File([JSON.stringify({ ...FIXTURE, id: 'unsaved-layout' })], 'new.json', { type: 'application/json' })] } });
    await waitFor(() => expect(title().textContent).toContain('unsaved-layout'));
    const row = await within(screen.getByRole('region', { name: 'Layouts' })).findByRole('button', { name: 'unsaved-layout' });
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(server.state.writes).toEqual([]);
  });
});
