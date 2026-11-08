import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RichEditorToolbarApi } from '../RichEditor';

const gate = vi.hoisted(() => ({ ready: false }));
vi.mock('@tiptap/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return { ...actual, useEditor: (...args: Parameters<typeof actual.useEditor>) => {
    const editor = actual.useEditor(...args);
    return gate.ready ? editor : null;
  } };
});
import RichEditorImpl from '../RichEditorImpl';
import { AttachButton } from '../toolbar/AttachButton';
import { RichEditor } from '../RichEditor';

describe('#1543 delayed editor readiness', () => {
  beforeEach(() => { gate.ready = false; });
  it('rejects an actual file pick through the current-render integration helper while mount is delayed, then accepts a ready pick', async () => {
    const result = { attachment_id: '11111111-1111-1111-1111-111111111111', name: 'shot.png', size_bytes: 1, mime_type: 'image/png' };
    const onAttach = vi.fn().mockResolvedValue(result);
    let error: unknown;
    const element = () => <RichEditor surface="voc-description" onAttach={onAttach} toolbar={(_editor, api) => <AttachButton data-testid="delayed-attach" onPick={async file => { try { await api.attach(file); } catch (caught) { error = caught; } }} />} />;
    const { rerender } = render(element());
    const input = await screen.findByTestId('delayed-attach-input');
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(error).toBeInstanceOf(Error));
    expect((error as Error).message).toContain('editor is not ready');
    expect(onAttach).not.toHaveBeenCalled();
    gate.ready = true;
    rerender(element());
    await screen.findByRole('textbox');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(document.querySelector('[data-attachment-id]')).toHaveAttribute('data-attachment-id', result.attachment_id));
    expect(onAttach).toHaveBeenCalledTimes(1);
  });
  it('inserts from a toolbar API retained during the null-editor render after the editor becomes ready', async () => {
    const result = { attachment_id: '11111111-1111-1111-1111-111111111111', name: 'shot.png', size_bytes: 1, mime_type: 'image/png' };
    let initialApi: RichEditorToolbarApi | undefined;
    const element = () => <RichEditorImpl surface="voc-description" onAttach={async () => result} toolbar={(_editor, api) => { initialApi ??= api; return null; }} />;
    const { rerender } = render(element());
    gate.ready = true;
    rerender(element());
    await screen.findByRole('textbox');
    await act(async () => { await initialApi!.attach(new File(['x'], 'shot.png', { type: 'image/png' })); });
    const node = document.querySelector('[data-attachment-id]');
    expect({ found: !!node, id: node?.getAttribute('data-attachment-id') }).toMatchObject({ found: true, id: result.attachment_id });
  });
  it('rejects an early pick instead of silently uploading without insertion, and a retained API works once ready', async () => {
    const result = { attachment_id: '11111111-1111-1111-1111-111111111111', name: 'shot.png', size_bytes: 1, mime_type: 'image/png' };
    const onAttach = vi.fn().mockResolvedValue(result);
    let initialApi: RichEditorToolbarApi | undefined;
    const element = () => <RichEditorImpl surface="voc-description" onAttach={onAttach} toolbar={(_editor, api) => { initialApi ??= api; return <button type="button">Custom attach</button>; }} />;
    const { rerender } = render(element());
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    await expect(initialApi!.attach(file)).rejects.toThrow('editor is not ready');
    expect(onAttach).not.toHaveBeenCalled();
    gate.ready = true;
    rerender(element());
    await screen.findByRole('textbox');
    await act(async () => { await initialApi!.attach(file); });
    await waitFor(() => expect(document.querySelector('[data-attachment-id]')).toHaveAttribute('data-attachment-id', result.attachment_id));
  });
});
