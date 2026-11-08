import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RichEditorAttachmentResult, RichEditorToolbarApi } from '../RichEditor';
import RichEditorImpl from '../RichEditorImpl';

const result: RichEditorAttachmentResult = { attachment_id: '11111111-1111-1111-1111-111111111111', name: 'shot.png', size_bytes: 1, mime_type: 'image/png' };
const file = () => new File(['x'], 'shot.png', { type: 'image/png' });

describe('toolbar attachment disabled transitions', () => {
  it('retains a completed upload while disabled and inserts it exactly once on re-enable', async () => {
    let resolve!: (value: RichEditorAttachmentResult) => void;
    const onAttach = vi.fn(() => new Promise<RichEditorAttachmentResult>(done => { resolve = done; }));
    let api: RichEditorToolbarApi;
    const element = (disabled: boolean) => <RichEditorImpl surface="voc-description" disabled={disabled} onAttach={onAttach} toolbar={(_editor, current) => { api = current; return null; }} />;
    const { rerender } = render(element(false));
    await screen.findByRole('textbox');
    let upload!: Promise<RichEditorAttachmentResult>;
    act(() => { upload = api.attach(file()); });
    rerender(element(true));
    await act(async () => { resolve(result); await upload; });
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
    expect(document.querySelector('[data-attachment-id]')).toBeNull();
    rerender(element(false));
    await waitFor(() => expect(document.querySelector('[data-attachment-id]')).toHaveAttribute('data-attachment-id', result.attachment_id));
    rerender(element(true));
    rerender(element(false));
    expect(document.querySelectorAll('[data-attachment-id]')).toHaveLength(1);
    expect(onAttach).toHaveBeenCalledTimes(1);
  });
  it('rejects a disabled-at-start API call before uploading', async () => {
    const onAttach = vi.fn().mockResolvedValue(result);
    let api: RichEditorToolbarApi;
    render(<RichEditorImpl surface="voc-description" disabled onAttach={onAttach} toolbar={(_editor, current) => { api = current; return null; }} />);
    await screen.findByRole('textbox');
    await expect(api!.attach(file())).rejects.toThrow('editor is disabled');
    expect(onAttach).not.toHaveBeenCalled();
  });
});
