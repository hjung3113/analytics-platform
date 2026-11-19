// useComposerEditorFocus — lets a composer move focus into its RichEditor after a successful
// submit. RichEditor only hands the live editor to its `toolbar` render prop, so the composer
// mounts <EditorHandle> there; the handle registers the editor from an effect (never during
// render) and unregisters it on unmount.

import type { TipTapEditor } from '../../../ui/index';
import * as React from 'react';

export interface ComposerEditorFocus {
  /** Render inside the RichEditor `toolbar` prop. */
  editorHandle: (editor: TipTapEditor | null) => React.ReactElement;
  /** Focus the registered editor (caret at the end). No-op when none is mounted. */
  focusEditor: () => void;
}

function EditorHandle({
  editor,
  register,
  focusOnRegister,
}: {
  editor: TipTapEditor | null;
  register: (editor: TipTapEditor | null) => void;
  focusOnRegister: boolean;
}): null {
  React.useEffect(() => {
    register(editor);
    if (editor !== null && focusOnRegister) editor.commands.focus('end');
    return () => register(null);
  }, [editor, focusOnRegister, register]);
  return null;
}

export function useComposerEditorFocus(
  { focusOnRegister = false }: { focusOnRegister?: boolean } = {},
): ComposerEditorFocus {
  const editorRef = React.useRef<TipTapEditor | null>(null);
  const register = React.useCallback((editor: TipTapEditor | null) => {
    editorRef.current = editor;
  }, []);
  const focusEditor = React.useCallback(() => {
    editorRef.current?.commands.focus('end');
  }, []);
  const editorHandle = React.useCallback(
    (editor: TipTapEditor | null) => (
      <EditorHandle editor={editor} register={register} focusOnRegister={focusOnRegister} />
    ),
    [focusOnRegister, register],
  );
  return { editorHandle, focusEditor };
}
