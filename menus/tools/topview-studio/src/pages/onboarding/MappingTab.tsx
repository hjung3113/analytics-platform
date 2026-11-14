import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { Redo2, Save, Undo2 } from 'lucide-react';
import { canonicalJson } from '@eqv/core';
import {
  addPatternRule, applyEdit, applyEdits, applySaveOutcome, buildSavePayload, canRedoBoard, canUndoBoard, dirtyScopes, explainRow, isBoardDirty, paletteOptions,
  previewPatternRule, redoBoard, resolveBoard, suggestPattern, undoBoard,
  type BoardEdit, type BoardInput, type BoardRow, type BoardState, type BoardStatus, type SaveOutcome, type SaveScope,
} from '@eqv/editor';
import { useMenuAction, usePlatform } from '@ap/kernel';
import {
  Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, FieldLabel, FieldList, FieldRow, Input, Label,
  PanelSectionTitle, RadioGroup, RadioGroupItem, SearchInput, StatusBadge, cn, type Tone,
} from '@ap/ui';
import { RULES_EDIT_PERMISSION, saveAliasRules, type JsonDocument } from '../../endpoints';
import { Canvas, PANEL } from '../../parts/Canvas';
import { IconAction, Toolbar } from '../../parts/Toolbar';
import { DiscardDialog } from '../../parts/Dialogs';
import type { EquipmentData } from './useEquipment';

const STATUS_WORD: Record<BoardStatus, string> = { conflict: '충돌', ignored: '무시', verified: '확정', assumed: '자동', unmapped: '미매핑' };
const STATUS_TONE: Record<BoardStatus, Tone> = { conflict: 'danger', verified: 'success', assumed: 'warning', unmapped: 'neutral', ignored: 'neutral' };
const LEVEL_WORD: Record<string, string> = { global: '전체', maker: '설비사', model: 'Model', equipment: '설비' };
export const SHORTCUTS = 'j/k 이동 · Enter 확정 · A 배정 · I 무시 · R 규칙화 · / 검색 · Ctrl/Cmd+Z 실행 취소';
/** The ONBOARDING §5 badge: the saved rules now resolve this alias differently from the published Mapping Version. */
export const NEW_RULE_BADGE = '새 규칙 반영 가능';

const snapshot = (value: { target: unknown; certainty: unknown; level: unknown; ruleId: unknown } | null) => canonicalJson(value);

export interface MappingTabProps {
  input: BoardInput;
  board: BoardState;
  setBoard: Dispatch<SetStateAction<BoardState | null>>;
  saveScope: SaveScope;
  setSaveScope(scope: SaveScope): void;
  data: EquipmentData;
  /** The rule-file versions the Board was built from; a save sends only these (#2035). */
  boardVersions: EquipmentData['ruleVersions'];
  onSaved(scope: SaveScope, version: string): void;
  /** A save answered `conflict`: saving stays locked until `onReload` rebuilds the Board from the latest files. */
  conflict: boolean;
  onConflict(): void;
  onReload(): void;
  /** True from a save's start until its Board and versions are settled: the parent rebuilds nothing meanwhile. */
  onSaving(saving: boolean): void;
}

const CONFLICT_TEXT = '다른 사용자가 먼저 저장했습니다. 다시 불러온 뒤 편집하세요.';

/**
 * ④ Mapping Board (ONBOARDING §4): alias list grouped by Role | Layouts `Canvas` | Inspector. The Board follows viewer clicks (EV#60) and
 * the viewer fills its area. Edits write only the save scope's alias-rules file; the state lives above the tabs.
 */
export function MappingTab({ input, board, setBoard, saveScope, setSaveScope, data, boardVersions, onSaved, conflict, onConflict, onReload, onSaving }: MappingTabProps) {
  const { can, toast } = usePlatform();
  const writable = can(RULES_EDIT_PERMISSION);
  const ids = useId();
  const save = useMenuAction(saveAliasRules);
  const [alias, setAlias] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<{ state: BoardState; text: string } | null>(null);
  const [savedState, setSavedState] = useState<BoardState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const [palette, setPalette] = useState<{ alias: string; filter: string; active: number } | null>(null);
  // `touched`: problems show after a change or a submit, not on open (a prefilled empty target is not an error yet).
  const [rule, setRule] = useState<{ alias: string; pattern: string; target: string; touched: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  const { equipment, layout } = input;
  const { names } = data;
  const view = useMemo(() => resolveBoard(input, board.present, saveScope, board.baseline), [input, board.present, board.baseline, saveScope]);
  // What the saved rules give each alias, against the published Mapping Version (§5 «새 규칙 반영 가능»).
  const published = useMemo(() => new Map((data.previous?.entries ?? []).map((e) => [e.alias, snapshot({ target: e.target, certainty: e.certainty, level: e.rule.scope.level, ruleId: e.rule.ruleId })])), [data.previous]);
  const savedRows = useMemo(() => (data.previous ? resolveBoard(input, board.baseline, saveScope, board.baseline).rows : []), [input, board.baseline, saveScope, data.previous]);
  const newRule = useMemo(() => new Set(savedRows.filter((row) => !row.draft && (published.get(row.alias) ?? snapshot(null)) !== snapshot(row.target ? { target: row.target, certainty: row.certainty, level: row.rule?.level ?? null, ruleId: row.rule?.ruleId ?? null } : null)).map((row) => row.alias)), [savedRows, published]);
  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => view.groups.map((g) => ({ role: g.role, rows: g.rows.filter((row) => !needle || [row.alias, row.moduleType ?? '', row.componentId ?? ''].some((v) => v.toLowerCase().includes(needle))) }))
    .filter((g) => g.rows.length > 0), [view, needle]);
  const rows = groups.flatMap((g) => g.rows);
  const selected = rows.find((row) => row.alias === alias) ?? null;
  const references = useMemo(() => new Map(input.inventory.aliases.map((a) => [a.alias, a.references])), [input.inventory]);
  const viewerId = picked ?? selected?.componentId ?? null;
  const autoRows = rows.filter((row) => row.status === 'assumed');
  const dirty = isBoardDirty(board);
  const payload = useMemo(() => buildSavePayload(input, board, saveScope), [input, board, saveScope]);
  const canSave = writable && payload.files.length > 0 && !save.pending && !conflict;
  const confirmReason = !selected ? null : !selected.target ? '배정된 대상이 없어 확정할 수 없습니다'
    : applyEdit(input, board, saveScope, { kind: 'confirm', alias: selected.alias }) === board ? '저장 범위에 이미 같은 verified 정확 규칙이 있습니다' : null;
  const preview = useMemo(() => (rule ? previewPatternRule(input, board.present, saveScope, { pattern: rule.pattern, target: rule.target }) : null), [input, board.present, saveScope, rule]);
  const options = useMemo(() => (palette ? paletteOptions(layout, rows.find((row) => row.alias === palette.alias)?.role ?? 'unknown', palette.filter) : []), [layout, rows, palette]);

  const returnToList = (event: Event) => { event.preventDefault(); listRef.current?.focus(); };
  const select = (name: string) => { setAlias(name); setPicked(null); };
  const move = (step: number) => {
    if (!rows.length) return;
    const index = selected ? rows.indexOf(selected) : -1;
    select(rows[Math.min(rows.length - 1, Math.max(0, index + step))]!.alias);
  };
  const edit = (change: BoardEdit) => {
    if (!writable || save.pending) return;
    if (change.kind === 'confirm' && confirmReason) { setNotice({ state: board, text: confirmReason }); return; }
    setBoard((current) => (current ? applyEdit(input, current, saveScope, change) : current));
  };
  const confirmAuto = () => {
    if (!writable || save.pending || autoRows.length === 0) return;
    const result = applyEdits(input, board, saveScope, autoRows.map((row) => ({ kind: 'confirm' as const, alias: row.alias })), view);
    setBoard(result.state);
    setNotice({ state: result.state, text: `${result.applied.length}건 확정${result.skipped.length ? `, ${result.skipped.length}건 건너뜀` : ''}` });
  };
  const openPalette = () => { if (writable && selected) setPalette({ alias: selected.alias, filter: '', active: 0 }); };
  const openRule = () => {
    if (!writable || !selected) return;
    const suggestion = suggestPattern(selected.alias, selected.componentId);
    setRule({ alias: selected.alias, pattern: suggestion?.pattern ?? '', target: suggestion?.target ?? '', touched: false });
  };
  // The Board follows the viewer (EV#60): a Component click selects the first alias assigned to it.
  const onViewerSelect = (componentId: string | null) => {
    setPicked(componentId);
    const owner = componentId ? rows.find((row) => row.componentId === componentId) : undefined;
    if (owner) setAlias(owner.alias);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    const plain = key.toLowerCase();
    if (plain === 'j' || key === 'ArrowDown') move(1);
    else if (plain === 'k' || key === 'ArrowUp') move(-1);
    else if (key === '/') searchRef.current?.focus();
    else if (key === 'Enter' && selected) edit({ kind: 'confirm', alias: selected.alias });
    else if (plain === 'a') openPalette();
    else if (plain === 'i' && selected) edit({ kind: 'ignore', alias: selected.alias });
    else if (plain === 'r') openRule();
    else return;
    event.preventDefault();
  };
  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!writable || save.pending || event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, [role="dialog"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) setBoard((b) => (b ? undoBoard(b) : b));
    else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) setBoard((b) => (b ? redoBoard(b) : b));
    else return;
    event.preventDefault();
  };

  const onSave = async () => {
    if (!canSave) return;
    statusRef.current?.focus();
    setSaveError(null);
    onSaving(true);
    try {
      const sent = payload;
      const outcome: { savedScopes: SaveScope[]; error?: string } = { savedScopes: [] };
      for (const scope of ['equipment', 'model'] as const) {
        const file = sent.files.find((f) => f.scope === scope);
        if (!file) continue;
        const params = scope === 'model' ? { level: 'model' as const, vendorId: equipment.maker, modelId: equipment.model } : { level: 'equipment' as const, equipmentId: equipment.equipmentId };
        try {
          const result = await save.run({ ...params, document: file.file as unknown as JsonDocument }, { expectedVersion: boardVersions[scope] });
          if (result.outcome === 'conflict') { onConflict(); outcome.error = CONFLICT_TEXT; break; }
          if (result.outcome !== 'ok' || !result.data) { outcome.error = result.outcome === 'forbidden' ? '권한이 없어 저장하지 못했습니다.' : '저장하지 못했습니다.'; break; }
          onSaved(scope, result.data.version);
          outcome.savedScopes.push(scope);
        } catch { outcome.error = '저장하지 못했습니다.'; break; }
      }
      const next = applySaveOutcome(board, sent, outcome as SaveOutcome);
      setBoard(next);
      setSavedState(outcome.error ? null : next);
      setSaveError(outcome.error === CONFLICT_TEXT ? null : outcome.error ?? null);
      if (!outcome.error) toast('alias 규칙을 저장했습니다', 'info');
    } finally {
      // Same task as the settle above, so React commits the Board, its versions and the end of the flight together.
      onSaving(false);
    }
  };

  // 다시 불러오기: unsaved edits are discarded only after a confirm. The opener leaves with the conflict, so focus goes to the Alias list
  // once the reload commits (a cancel keeps the dialog's return to the opener).
  const focusListAfterReload = useRef(false);
  useEffect(() => {
    if (!focusListAfterReload.current) return;
    focusListAfterReload.current = false;
    listRef.current?.focus();
  });
  const reload = () => { focusListAfterReload.current = true; setConfirmReload(false); setSaveError(null); setSavedState(null); onReload(); };
  const askReload = () => { if (dirty) setConfirmReload(true); else reload(); };
  const errorText = conflict ? CONFLICT_TEXT : saveError;

  const statusText = save.pending ? '저장 중…' : notice?.state === board ? notice.text
    : dirty ? `저장 안 됨 · ${dirtyScopes(board).map((s) => LEVEL_WORD[s]).join(', ')}` : view.drafts.length ? `초안 ${view.drafts.length}건 (저장하면 assumed 규칙으로 기록)` : board === savedState ? '저장됨' : '변경 없음';
  const targetText = (row: BoardRow) => {
    if (!row.componentId) return '—';
    return layout.components.some((c) => c.id === row.componentId) ? row.componentId : `${row.componentId} (레이아웃에 없음)`;
  };
  const optionId = (name: string) => `${ids}-alias-${name}`;
  const lines = selected ? explainRow(selected) : [];
  const pickedComponent = picked && !selected?.componentId ? layout.components.find((c) => c.id === picked) : undefined;

  return <div className={cn(PANEL, 'flex-1')} onKeyDown={onRootKeyDown}>
    {writable && <div role="toolbar" aria-label="Mapping 도구" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2 text-xs">
      <span aria-hidden className="text-text-secondary">저장 범위</span>
      <RadioGroup aria-label="저장 범위" className="flex flex-wrap" value={saveScope} disabled={save.pending} onValueChange={(value) => setSaveScope(value as SaveScope)}>
        {([['model', `Model (${names.maker} / ${names.model})`], ['equipment', `설비 (${equipment.equipmentId})`]] as const).map(([scope, label]) =>
          <span key={scope} className="flex items-center gap-1.5"><RadioGroupItem id={`${ids}-scope-${scope}`} value={scope} /><Label htmlFor={`${ids}-scope-${scope}`}>{label}</Label></span>)}
      </RadioGroup>
      <IconAction label="실행 취소 · Ctrl/Cmd+Z" icon={<Undo2 className="size-4" aria-hidden />} disabled={save.pending || !canUndoBoard(board)} onClick={() => setBoard((b) => (b ? undoBoard(b) : b))} />
      <IconAction label="다시 실행 · Ctrl/Cmd+Shift+Z" icon={<Redo2 className="size-4" aria-hidden />} disabled={save.pending || !canRedoBoard(board)} onClick={() => setBoard((b) => (b ? redoBoard(b) : b))} />
      <Button size="toolbar" variant="secondary" disabled={save.pending || autoRows.length === 0} onClick={confirmAuto}>자동 일괄 확정 ({autoRows.length})</Button>
      <Button size="toolbar" variant="primary" disabled={!canSave} aria-describedby={conflict ? `${ids}-save-locked` : undefined} onClick={() => void onSave()}><Save className="size-3.5" aria-hidden />저장</Button>
      {conflict && <span id={`${ids}-save-locked`} className="text-text-muted">다시 불러온 뒤 저장하세요</span>}
      <span ref={statusRef} role="status" tabIndex={-1} className="text-text-secondary">{statusText}</span>
      {saveScope === 'model' && <span className="text-text-muted">Model 범위 규칙은 {names.maker} / {names.model}의 모든 설비에 적용됩니다.</span>}
    </div>}
    {errorText && <div className="shrink-0 border-b border-border-subtle p-2"><Callout tone="red" action={conflict ? <Button size="toolbar" variant="secondary" onClick={askReload}>다시 불러오기</Button> : undefined}><span role="alert">{errorText}</span></Callout></div>}
    {confirmReload && <DiscardDialog title="Mapping을 다시 불러올까요?" body="저장하지 않은 Mapping 변경을 버립니다. 다른 사용자가 저장한 최신 규칙으로 Board를 다시 만듭니다." confirmLabel="버리고 다시 불러오기"
      onConfirm={reload} onCancel={() => setConfirmReload(false)} />}
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <aside aria-label="Alias" className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-card">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <SearchInput size="toolbar" className="w-full" inputRef={searchRef} aria-label="Alias 검색" clearLabel="검색어 지우기" placeholder="/ 검색" value={query} onValueChange={setQuery}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { setQuery(''); listRef.current?.focus(); }
              else if (event.key === 'Enter' || event.key === 'ArrowDown') listRef.current?.focus();
              else return;
              event.preventDefault();
            }} />
        </div>
        <div ref={listRef} role="listbox" tabIndex={0} aria-label="Alias 목록" aria-activedescendant={selected ? optionId(selected.alias) : undefined} onKeyDown={onListKeyDown}
          className="min-h-0 flex-1 overflow-y-auto p-2 focus-visible:outline-2 focus-visible:outline-focus-ring">
          {groups.map((group) => <div key={group.role} role="group" aria-label={`Role ${group.role}`}>
            <PanelSectionTitle size="tiny" className="mb-0 px-1 pt-2 pb-1" aria-hidden="true">{group.role}</PanelSectionTitle>
            {group.rows.map((row) => <div key={row.alias} id={optionId(row.alias)} role="option" aria-selected={row === selected}
              aria-label={`${row.alias}, ${STATUS_WORD[row.status]}${row.statusText.endsWith('(미저장)') ? ' (미저장)' : ''}, ${row.componentId ? targetText(row) : '배정 없음'}${newRule.has(row.alias) ? `, ${NEW_RULE_BADGE}` : ''}`}
              className={cn('cursor-pointer space-y-1 rounded-md px-2 py-1.5 text-xs hover:bg-surface-row-hover', row === selected && 'bg-surface-row-selected')} onClick={() => select(row.alias)}>
              <span className="flex items-center justify-between gap-2"><span className="font-medium">{row.alias}</span><span className="text-text-muted">{references.get(row.alias) ?? 0} 참조</span></span>
              <span className="flex flex-wrap items-center gap-2"><span className="font-mono">{targetText(row)}</span>
                <StatusBadge tone={STATUS_TONE[row.status]}>{STATUS_WORD[row.status]}{row.statusText.endsWith('(미저장)') ? ' · 미저장' : ''}</StatusBadge>
                {row.rule && <span className="text-text-muted">{LEVEL_WORD[row.rule.level] ?? row.rule.level}</span>}</span>
              {newRule.has(row.alias) && <span className="block"><StatusBadge tone="warning">{NEW_RULE_BADGE}</StatusBadge></span>}
            </div>)}
          </div>)}
          {rows.length === 0 && <EmptyState size="sm" title="일치하는 alias가 없습니다" />}
        </div>
      </aside>
      <div className={cn(PANEL, 'flex-1')}>
        <Toolbar modeText={<>Mapping 초안 · <span className="font-mono">{layout.id}</span></>} tools={null} count={layout.components.length} loading={false} />
        <Canvas layout={layout} selectedId={viewerId} onSelect={onViewerSelect} />
      </div>
      <aside aria-label="선택 검사" className="w-64 shrink-0 overflow-y-auto border-l border-border-subtle bg-surface-card p-3 text-xs">
        <PanelSectionTitle>선택 항목</PanelSectionTitle>
        {selected ? <div className="space-y-3">
          <FieldList>
            <FieldRow layout="property" label="Alias" mono>{selected.alias}</FieldRow>
            <FieldRow layout="property" label="ModuleType" mono>{selected.moduleType ?? '—'}</FieldRow>
            <FieldRow layout="property" label="Role">{selected.role}</FieldRow>
            <FieldRow layout="property" label="slots">{selected.slots.length ? selected.slots.join(', ') : '—'}</FieldRow>
            <FieldRow layout="property" label="상태">{selected.statusText.replace(/^\S+ /, '')}</FieldRow>
            <FieldRow layout="property" label="Component" mono>{targetText(selected)}</FieldRow>
            <FieldRow layout="property" label="규칙">{selected.draft ? `초안 (저장 시 ${selected.rule?.ruleId ?? ''})` : selected.rule ? `${LEVEL_WORD[selected.rule.level] ?? selected.rule.level} · ${selected.rule.ruleId} · ${selected.rule.kind === 'exact' ? '정확' : '패턴'}` : '—'}</FieldRow>
            <FieldRow layout="property" label="확실성">{selected.certainty ?? '—'}</FieldRow>
          </FieldList>
          {selected.overriddenBy && <Callout tone="amber">설비 범위 규칙({selected.overriddenBy})이 우선합니다. 확정하려면 저장 범위를 설비로 바꾸세요.</Callout>}
          {saveScope === 'model' && selected.changedModelRule && <Callout tone="amber">Model 규칙 {selected.changedModelRule}을(를) 바꿉니다. {names.maker} / {names.model}의 모든 설비에 적용됩니다.</Callout>}
          {lines.length > 0 && <Callout tone="amber"><ul className="m-0 list-disc pl-4" aria-label="충돌과 문제">{lines.map((line) => <li key={line}>{line}</li>)}</ul></Callout>}
          {writable && <>
            {confirmReason && <p id={`${ids}-confirm-reason`} className="text-text-muted">{confirmReason}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="toolbar" variant="secondary" disabled={save.pending} aria-keyshortcuts="A" onClick={openPalette}>배정 (A)</Button>
              <Button size="toolbar" variant="secondary" disabled={save.pending} aria-disabled={!!confirmReason} aria-describedby={confirmReason ? `${ids}-confirm-reason` : undefined} aria-keyshortcuts="Enter" onClick={() => edit({ kind: 'confirm', alias: selected.alias })}>확정 (Enter)</Button>
              <Button size="toolbar" variant="secondary" disabled={save.pending} aria-keyshortcuts="I" onClick={() => edit({ kind: 'ignore', alias: selected.alias })}>무시 (I)</Button>
              <Button size="toolbar" variant="secondary" disabled={save.pending} aria-keyshortcuts="R" onClick={openRule}>규칙화 (R)</Button>
            </div>
          </>}
        </div> : pickedComponent ? <FieldList><FieldRow layout="property" label="Component" mono>{pickedComponent.id}</FieldRow><FieldRow layout="property" label="배정된 alias">없음</FieldRow></FieldList>
          : <EmptyState size="sm" title="alias 또는 Component를 선택하세요" />}
      </aside>
    </div>
    <div aria-label="동작 안내" className="flex h-8 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-t border-border-subtle px-4 text-xs text-text-muted">
      <span>{writable ? SHORTCUTS : '조회 전용 · alias와 Component 확인 가능'}</span>
    </div>
    {palette && <Dialog open onOpenChange={(open) => { if (!open) setPalette(null); }}>
      <DialogContent closeLabel="창 닫기" className="break-keep" onCloseAutoFocus={returnToList} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!options.length) return;
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setPalette((p) => p && { ...p, active: (Math.min(p.active, options.length - 1) + step + options.length) % options.length });
        } else if (event.key === 'Enter') {
          const option = options[Math.min(palette.active, options.length - 1)];
          if (option) { edit({ kind: 'assign', alias: palette.alias, componentId: option.id }); setPalette(null); }
        } else return;
        event.preventDefault();
      }}>
        <DialogHeader><DialogTitle>{palette.alias}를 배정할 Component</DialogTitle><DialogDescription>↑↓로 고르고 Enter로 배정합니다. Esc로 닫습니다.</DialogDescription></DialogHeader>
        <Input inputSize="toolbar" role="combobox" aria-label="Component 필터" aria-expanded="true" aria-controls={`${ids}-palette`} value={palette.filter} onChange={(event) => setPalette({ ...palette, filter: event.target.value, active: 0 })} />
        <div id={`${ids}-palette`} role="listbox" aria-label="Component 목록" className="max-h-64 overflow-y-auto">
          {options.map((option, index) => <div key={option.id} role="option" aria-selected={index === Math.min(palette.active, options.length - 1)}
            className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-xs', index === Math.min(palette.active, options.length - 1) && 'bg-surface-row-selected')}
            onClick={() => { edit({ kind: 'assign', alias: palette.alias, componentId: option.id }); setPalette(null); }}>
            <span className="font-mono">{option.id}</span><span className="text-text-secondary">{option.role}</span></div>)}
          {options.length === 0 && <EmptyState size="sm" title="일치하는 Component가 없습니다" />}
        </div>
        <DialogFooter spacing="compact"><Button size="toolbar" variant="secondary" onClick={() => setPalette(null)}>닫기</Button></DialogFooter>
      </DialogContent>
    </Dialog>}
    {rule && preview && <Dialog open onOpenChange={(open) => { if (!open) setRule(null); }}>
      <DialogContent closeLabel="창 닫기" className="break-keep" onCloseAutoFocus={returnToList}>
        <DialogHeader><DialogTitle>{rule.alias}에서 규칙 만들기 · 저장 범위 {LEVEL_WORD[saveScope]}</DialogTitle>
          <DialogDescription>패턴에 맞는 alias를 한 번에 같은 규칙으로 배정합니다. 추가 전에 결과를 확인하세요.</DialogDescription></DialogHeader>
        <form noValidate className="space-y-3" id={`${ids}-rule`} onSubmit={(event) => {
          event.preventDefault();
          if (preview.problems.length) { setRule({ ...rule, touched: true }); return; }
          if (!writable) return;
          const next = addPatternRule(input, board, saveScope, { pattern: rule.pattern, target: rule.target });
          setBoard(next);
          setNotice({ state: next, text: `규칙 ${preview.rule?.id ?? ''} 추가${preview.removes.length ? ` · 정리 ${preview.removes.length}건` : ''}` });
          setRule(null);
        }}>
          <div className="space-y-1"><FieldLabel htmlFor={`${ids}-pattern`}>패턴</FieldLabel><Input id={`${ids}-pattern`} inputSize="toolbar" value={rule.pattern} onChange={(event) => setRule({ ...rule, pattern: event.target.value, touched: true })} /></div>
          <div className="space-y-1"><FieldLabel htmlFor={`${ids}-target`}>대상 Component</FieldLabel><Input id={`${ids}-target`} inputSize="toolbar" value={rule.target} onChange={(event) => setRule({ ...rule, target: event.target.value, touched: true })} /></div>
          <p role="status" className="text-xs">{preview.summary}</p>
          {preview.rows.length > 0 && <ul aria-label="규칙 미리보기" className="max-h-40 list-disc overflow-y-auto pl-5 text-xs">{preview.rows.map((row) => <li key={row.alias}>{row.alias} → {row.target ?? '—'} · {row.outcome}</li>)}</ul>}
          {rule.touched && preview.problems.length > 0 && <Callout tone="amber"><ul id={`${ids}-rule-problem`} className="m-0 list-disc pl-4" aria-label="규칙 문제">{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul></Callout>}
        </form>
        <DialogFooter spacing="compact">
          <Button size="toolbar" variant="secondary" onClick={() => setRule(null)}>닫기</Button>
          <Button size="toolbar" variant="primary" type="submit" form={`${ids}-rule`} disabled={rule.touched && preview.problems.length > 0} aria-describedby={rule.touched && preview.problems.length ? `${ids}-rule-problem` : undefined}>규칙 추가</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </div>;
}

