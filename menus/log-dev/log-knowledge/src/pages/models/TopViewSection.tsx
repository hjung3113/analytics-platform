import { useEffect, useRef, useState } from 'react';
import { PlatformLink, useMenuAction, useMenuQuery, usePlatform } from '@ap/kernel';
import { QueryView } from '@ap/components';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FieldLabel, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@ap/ui';
import { formatInstant } from '@ap/contracts';
import {
  linkTopView, modelTopViewEndpoint, topViewRevisionOptionsEndpoint, unlinkTopView,
  type ModelTopViewData, type TopViewLinkItem, type TopViewSoftwareOption,
} from '../../endpoints';
import { modelTopView } from '../../model-topview-slot';
import { EmptyNote } from './ProfileParts';
import { START_DEFAULT, linkFieldErrors, shortRevision, startLabel } from './topViewModel';

const STUDIO_MENU_ID = 'eqv-studio';
const revisionKey = (r: { layoutId: string; revision: string }) => `${r.layoutId}|${r.revision}`;

function StudioLink({ layoutId, revision }: { layoutId: string; revision: string }) {
  const { registry, resolveLink } = usePlatform();
  // resolveLink throws for an unregistered menu, so look before resolving. No permission ⇒ no link.
  const link = registry.menus.some(m => m.id === STUDIO_MENU_ID) ? resolveLink(STUDIO_MENU_ID, { page: { layout: layoutId, revision } }) : null;
  if (!link?.allowed) return null;
  return <Button asChild size="toolbar" variant="secondary"><PlatformLink href={link.href}>Studio에서 열기</PlatformLink></Button>;
}

function Drawing({ data }: { data: ModelTopViewData }) {
  const View = modelTopView();
  const resolved = data.resolved;
  if (!resolved) return null;
  return View
    ? <div data-testid="model-topview-slot"><View layoutId={resolved.layoutId} revision={resolved.revision} document={resolved.document} /></div>
    : <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-4 text-sm text-text-secondary">이 화면에서는 Top View를 표시할 수 없습니다</p>;
}

/** The pickers' SW choices, newest release first (the server answers them oldest first); both pickers use this one list. */
type Software = readonly TopViewSoftwareOption[];
const newestFirst = (options: Software): Software => [...options].reverse();

function LinkDialog({ modelId, software, links, onClose, onDone }: { modelId: string; software: Software; links: TopViewLinkItem[]; onClose: () => void; onDone: () => void }) {
  const { toast } = usePlatform();
  const options = useMenuQuery(topViewRevisionOptionsEndpoint, {});
  const link = useMenuAction(linkTopView);
  const [pick, setPick] = useState('');
  const [start, setStart] = useState(START_DEFAULT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rows = options.response?.outcome === 'ok' ? (options.response.data?.rows ?? []) : [];
  // Three states of the Revision list, told apart: still loading, failed (retry), or loaded (possibly empty).
  const optionsState = options.response === null ? 'loading' : options.response.outcome === 'ok' ? 'ready' : 'failed';
  const fromSoftwareId = start === START_DEFAULT ? null : start;
  const existing = links.find(l => l.fromSoftwareId === fromSoftwareId);
  const submit = () => {
    // An untouched picker must not submit: look the pick up by identity, never index with an empty string.
    const row = pick === '' ? undefined : rows.find(r => revisionKey(r) === pick);
    if (!row) { setErrors({ revision: 'Revision을 골라 주세요' }); return; }
    void link.run({ modelId, fromSoftwareId, layoutId: row.layoutId, revision: row.revision }, { expectedVersion: existing ? existing.version : '0' }).then(res => {
      if (res.outcome === 'ok') { toast('Top View를 연결했습니다', 'info'); onDone(); onClose(); return; }
      if (res.outcome === 'conflict') { onDone(); setErrors({ form: '다른 사람이 먼저 고쳤습니다. 새로 불러온 뒤 다시 시도해 주세요.' }); return; }
      if (res.outcome === 'invalid') { setErrors(linkFieldErrors(res.fieldErrors)); return; }
      setErrors({ form: '저장하지 못했습니다.' });
    }).catch(() => undefined);
  };
  return <Dialog open onOpenChange={open => { if (!open && !link.pending) onClose(); }}>
    <DialogContent closeLabel="닫기">
      <DialogHeader><DialogTitle>Top View 연결</DialogTitle><DialogDescription className="break-keep">게시된 Layout Revision을 고르고, 적용을 시작할 SW 버전을 정합니다. 비우면 모델 기본으로 연결합니다.</DialogDescription></DialogHeader>
      <div className="grid gap-4 break-keep">
        <div className="grid gap-1.5"><FieldLabel htmlFor="topview-revision">Revision</FieldLabel>
          <Select value={pick} onValueChange={value => { setPick(value); setErrors(({ revision: _drop, ...rest }) => rest); }}><SelectTrigger id="topview-revision" appearance="field" aria-invalid={errors['revision'] !== undefined}><SelectValue placeholder="게시된 Revision을 골라 주세요" /></SelectTrigger>
            <SelectContent>{rows.map(r => <SelectItem key={revisionKey(r)} value={revisionKey(r)}><span className="t-mono">{r.layoutId}</span>{' · '}<span className="t-mono">{shortRevision(r.revision)}</span>{` · ${formatInstant(r.publishedAt, 'ko')}`}</SelectItem>)}</SelectContent></Select>
          {optionsState === 'loading' && <p role="status" className="text-xs text-text-muted">Revision 목록을 불러오는 중…</p>}
          {optionsState === 'ready' && rows.length === 0 && <p className="text-xs text-text-muted">게시된 Revision이 없습니다</p>}
          {optionsState === 'failed' && <p role="alert" className="flex items-center gap-2 text-xs text-text-danger-label">Revision 목록을 불러오지 못했습니다<Button type="button" size="toolbar" variant="secondary" onClick={() => options.refetch()}>다시 시도</Button></p>}
          {errors['revision'] && <p role="alert" className="text-xs text-text-danger-label">{errors['revision']}</p>}
        </div>
        <div className="grid gap-1.5"><FieldLabel htmlFor="topview-start">적용 시작 SW</FieldLabel>
          <Select value={start} onValueChange={setStart}><SelectTrigger id="topview-start" appearance="field" aria-invalid={errors['fromSoftwareId'] !== undefined}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={START_DEFAULT}>모델 기본</SelectItem>{software.map(s => <SelectItem key={s.softwareId} value={s.softwareId}>{s.version}</SelectItem>)}</SelectContent></Select>
          {errors['fromSoftwareId'] && <p role="alert" className="text-xs text-text-danger-label">{errors['fromSoftwareId']}</p>}
        </div>
        {existing && <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken p-3 text-xs text-text-secondary">{startLabel(existing.fromSoftwareVersion)}에 연결된 Layout <span className="font-mono break-all">{existing.layoutId}</span>을(를) 이 Revision으로 바꿉니다.</p>}
        {errors['form'] && <p role="alert" className="break-keep text-xs text-text-danger-label">{errors['form']}</p>}
      </div>
      <DialogFooter><Button type="button" size="toolbar" variant="secondary" disabled={link.pending} onClick={onClose}>취소</Button><Button type="button" size="toolbar" disabled={link.pending} onClick={submit}>{link.pending ? '저장 중…' : '연결'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function UnlinkDialog({ modelId, item, onClose, onDone, onUnlinked }: { modelId: string; item: TopViewLinkItem; onClose: () => void; onDone: () => void; onUnlinked: () => void }) {
  const { toast } = usePlatform();
  const unlink = useMenuAction(unlinkTopView);
  const succeeded = useRef(false);
  const confirm = () => {
    void unlink.run({ modelId, fromSoftwareId: item.fromSoftwareId }, { expectedVersion: item.version }).then(res => {
      if (res.outcome === 'ok') { succeeded.current = true; onUnlinked(); toast('Top View 연결을 해제했습니다', 'info'); }
      else if (res.outcome === 'conflict') toast('다른 사람이 먼저 고쳤습니다', 'warning', '새로 불러온 뒤 다시 시도해 주세요.');
      else toast('해제하지 못했습니다', 'danger');
      onDone(); onClose();
    }).catch(() => onClose());
  };
  return <AlertDialog open onOpenChange={open => { if (!open && !unlink.pending) onClose(); }}>
    {/* After a successful unlink the trigger row is gone: the list moves focus itself, so the dialog must not. */}
    <AlertDialogContent onCloseAutoFocus={e => { if (succeeded.current) e.preventDefault(); }}>
      <AlertDialogHeader><AlertDialogTitle>{startLabel(item.fromSoftwareVersion)} 연결을 해제할까요?</AlertDialogTitle>
        <AlertDialogDescription className="break-keep">Layout <span className="font-mono break-all">{item.layoutId}</span>의 도면은 그대로 남고, 이 모델과의 연결만 끊어집니다. 이 SW 버전부터는 앞선 연결이나 모델 기본을 따릅니다.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><Button asChild size="toolbar" variant="secondary"><AlertDialogCancel disabled={unlink.pending}>취소</AlertDialogCancel></Button><Button type="button" size="toolbar" disabled={unlink.pending} onClick={confirm}>{unlink.pending ? '해제 중…' : '해제'}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

function ManagerLinks({ modelId, software, links, onDone }: { modelId: string; software: Software; links: TopViewLinkItem[]; onDone: () => void }) {
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<TopViewLinkItem | null>(null);
  // Focus after an unlink: the nearest remaining 해제 button (next, else previous), else the 연결 button; set once the list no longer holds the row.
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const [focusAfter, setFocusAfter] = useState<{ removed: string; to: string | null } | null>(null);
  useEffect(() => {
    if (!focusAfter || links.some(l => l.linkId === focusAfter.removed)) return;
    ((focusAfter.to ? buttons.current.get(focusAfter.to) : null) ?? addButton.current)?.focus();
    setFocusAfter(null);
  }, [links, focusAfter]);
  const afterUnlink = (item: TopViewLinkItem) => {
    const at = links.findIndex(l => l.linkId === item.linkId);
    setFocusAfter({ removed: item.linkId, to: (links[at + 1] ?? links[at - 1])?.linkId ?? null });
  };
  return <div className="grid gap-1 border-t border-border-subtle pt-2">
    <div className="flex items-center justify-between gap-2"><h3 className="break-keep text-xs font-semibold text-text-secondary">연결 목록</h3><Button ref={addButton} type="button" size="toolbar" variant="secondary" onClick={() => setLinking(true)}>Top View 연결</Button></div>
    {links.length === 0 ? <p className="break-keep py-1 text-xs text-text-muted">연결이 없습니다</p> : <ul>
      {links.map(l => <li key={l.linkId} className="flex min-h-8 items-center justify-between gap-3 border-b border-border-subtle py-1 last:border-b-0">
        <span className="min-w-0 break-keep text-xs text-text-secondary"><span className="font-medium text-text-primary">{startLabel(l.fromSoftwareVersion)}</span>{' · Layout '}<span className="font-mono break-all">{l.layoutId}</span>{' · '}<span className="font-mono">{shortRevision(l.revision)}</span></span>
        <Button ref={node => { if (node) buttons.current.set(l.linkId, node); else buttons.current.delete(l.linkId); }} type="button" size="toolbar" variant="ghost" className="shrink-0" onClick={() => setUnlinking(l)}>해제</Button>
      </li>)}
    </ul>}
    {linking && <LinkDialog modelId={modelId} software={software} links={links} onClose={() => setLinking(false)} onDone={onDone} />}
    {unlinking && <UnlinkDialog modelId={modelId} item={unlinking} onClose={() => setUnlinking(null)} onDone={onDone} onUnlinked={() => afterUnlink(unlinking)} />}
  </div>;
}

/** The model profile's Top View section (#1656): the pointer that applies to a chosen SW version, the read-only drawing from the app-injected slot, the Studio link, and for catalog managers the link list. */
export function TopViewSection({ modelId, canEdit }: { modelId: string; canEdit: boolean }) {
  const [softwareId, setSoftwareId] = useState('');
  const query = useMenuQuery(modelTopViewEndpoint, softwareId ? { modelId, softwareId } : { modelId });
  return <QueryView widgetName="Top View" query={query}>{data => {
    if (!data) return <EmptyNote text="이 모델을 찾을 수 없습니다" />;
    const software = newestFirst(data.softwareOptions);
    const shown = softwareId || data.target?.softwareId || '';
    const resolved = data.resolved;
    return <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {resolved && <p className="min-w-0 break-keep text-sm text-text-primary">{`적용: ${startLabel(resolved.fromSoftwareVersion)} · Layout `}<span className="t-mono break-all">{resolved.layoutId}</span>{' · Revision '}<span className="t-mono">{shortRevision(resolved.revision)}</span></p>}
        <div className="flex shrink-0 items-center gap-2">
          {/* The SW choice stays in every state (linked, unlinked, Revision unavailable): it is the way back to another SW. */}
          {software.length > 0 && <div className="flex items-center gap-1.5"><span id="topview-base-sw" className="whitespace-nowrap break-keep text-xs text-text-secondary">기준 SW</span>
            <Select value={shown} onValueChange={setSoftwareId}><SelectTrigger density="compact" className="w-auto min-w-20" aria-labelledby="topview-base-sw"><SelectValue /></SelectTrigger>
              <SelectContent>{software.map(s => <SelectItem key={s.softwareId} value={s.softwareId}>{s.version}</SelectItem>)}</SelectContent></Select></div>}
          {resolved && <StudioLink layoutId={resolved.layoutId} revision={resolved.revision} />}
        </div>
      </div>
      {resolved ? <Drawing data={data} />
        : data.resolvedError
          ? <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-4 text-sm text-text-danger-label" role="alert">연결된 Revision을 읽을 수 없습니다</p>
          : <div className="grid gap-1 break-keep rounded-md bg-surface-sunken p-3"><p className="text-sm font-medium text-text-primary">미연결</p><p className="text-sm text-text-secondary">연결된 Top View가 없습니다</p></div>}
      {canEdit && <ManagerLinks modelId={modelId} software={software} links={data.links} onDone={query.refetch} />}
    </div>;
  }}</QueryView>;
}
