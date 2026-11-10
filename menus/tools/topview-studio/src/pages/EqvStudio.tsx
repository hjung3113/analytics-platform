import { useCallback, useState } from 'react';
import { validateLayout, type LayoutDocument } from '@eqv/core';
import { useMenuQuery, usePlatform } from '@ap/kernel';
import { PageKeyWarning, PlatformPage, QueryView, usePageKeyRules } from '@ap/components';
import { LAYOUT_EDIT_PERMISSION, REVISION_PATTERN, TEMPLATE_ID_PATTERN, layoutsEndpoint, templatesEndpoint, type LayoutRow } from '../endpoints';
import { dataOf } from '../model/query';
import { NoLayouts } from '../parts/FilesPane';
import StudioEditor from './StudioEditor';

const RULES = [
  { key: 'layout', label: { ko: 'Layout', en: 'Layout' }, valid: (raw: string) => TEMPLATE_ID_PATTERN.test(raw) },
  { key: 'revision', label: { ko: 'Revision', en: 'Revision' }, valid: (raw: string) => REVISION_PATTERN.test(raw) },
  { key: 'template', label: { ko: 'EV Template', en: 'EV Template' }, valid: (raw: string) => TEMPLATE_ID_PATTERN.test(raw) },
];

const readText = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

/** Reads of a file the person picked: only a valid equipment-layout opens, and it opens as an unsaved edit. */
async function readImport(file: File): Promise<{ layout: LayoutDocument } | { error: string }> {
  let raw: unknown;
  try { raw = JSON.parse(await readText(file)); } catch { return { error: 'JSON을 읽을 수 없습니다' }; }
  const result = validateLayout(raw);
  if (!result.ok) return { error: result.issues.slice(0, 5).map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n') };
  if (result.layout.kind !== 'equipment-layout') return { error: 'equipment-layout만 가져올 수 있습니다' };
  return { layout: result.layout };
}

// The Screen suffix keeps the component name clear of the imports above.
export default function EqvStudioScreen() {
  const { pageParam, setPage, can } = usePlatform();
  const rules = usePageKeyRules(RULES);
  const layoutsQ = useMenuQuery(layoutsEndpoint, {});
  const templatesQ = useMenuQuery(templatesEndpoint, {});
  // An import belongs to its destination Layout; `asking` while the open editor waits for the person to confirm leaving dirty edits for it.
  const [pending, setPending] = useState<{ layout: LayoutDocument; asking: boolean } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const onSeedDone = useCallback((done: LayoutDocument) => setPending(current => (current?.layout === done ? null : current)), []);
  const onImportStay = useCallback(() => setPending(current => (current?.asking ? null : current)), []);
  const onImportDrop = useCallback((id: string) => setPending(current => (current && current.layout.id !== id ? null : current)), []);
  const canEdit = can(LAYOUT_EDIT_PERMISSION);

  // The last list that was read: a failed refresh of the same read keeps an open editor (and its unsaved edits); a read that starts over never reuses it.
  const fresh = dataOf(layoutsQ)?.rows ?? null;
  const [kept, setKept] = useState<readonly LayoutRow[] | null>(null);
  if (fresh !== null && kept !== fresh) setKept(fresh);
  else if (layoutsQ.response === null && kept !== null) setKept(null);
  const rows = fresh ?? (layoutsQ.response?.outcome === 'error' ? kept : null);

  if (rules.invalid) return <PlatformPage><div className="break-keep"><PageKeyWarning sentences={rules.sentences} onRecover={rules.recover} /></div></PlatformPage>;
  if (rows === null) return <PlatformPage title="레이아웃"><div className="break-keep"><QueryView query={layoutsQ}>{() => null}</QueryView></div></PlatformPage>;
  const layoutId = pageParam('layout') ?? rows[0]?.layoutId ?? null;

  const onImportFile = async (file: File, dirty: boolean) => {
    const read = await readImport(file);
    if ('error' in read) { setImportError(read.error); return; }
    setImportError(null);
    if (read.layout.id !== layoutId && dirty) { setPending({ layout: read.layout, asking: true }); return; }
    setPending({ layout: read.layout, asking: false });
    if (read.layout.id !== layoutId) setPage({ layout: read.layout.id, revision: null, template: null });
  };
  // The editor has discarded its edits, so the move is no longer guarded.
  const onImportGo = (layout: LayoutDocument) => {
    setPending({ layout, asking: false });
    setPage({ layout: layout.id, revision: null, template: null });
  };

  if (layoutId === null) {
    return <PlatformPage title="레이아웃">
      <div className="break-keep"><NoLayouts canEdit={canEdit} onFile={file => void onImportFile(file, false)} />
      {importError && <p role="alert" className="whitespace-pre-line px-4 text-xs text-text-danger">{importError}</p>}</div>
    </PlatformPage>;
  }
  const importSeed = pending && !pending.asking && pending.layout.id === layoutId ? pending.layout : null;
  const importAsk = pending?.asking ? pending.layout : null;
  return <StudioEditor key={layoutId} layoutId={layoutId} layouts={rows} templatesQuery={templatesQ}
    importSeed={importSeed} onSeedDone={onSeedDone} onImportFile={(file, dirty) => void onImportFile(file, dirty)}
    importAsk={importAsk} onImportStay={onImportStay} onImportGo={onImportGo} onImportDrop={onImportDrop} importError={importError} onRetryList={fresh === null ? () => layoutsQ.refetch() : null} />;
}
