import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, usePlatform } from '@ap/kernel';
import { DetailDrawer, PlatformPage, StateMessage } from '@ap/components';
import { ArrowRight, MapPinOff, MousePointerClick, ServerCrash } from 'lucide-react';
import { Button, EmptyState, FieldRow } from '@ap/ui';
import { bindingLayout, seekSceneState, type EquipmentLayoutDocument, type OccurrenceBatch, type ReplayInput, type SceneState, type SiteWallClock } from '@eqv/core';
import { TopViewer, type ReplayOverlay } from '@eqv/renderer';
import { ACTIVITY_KO, CursorStateList, Evidence, wallClockText } from '@eqv/replay';
import { Panel, ViewerZoomControls } from '@eqv/ui';
import { NoticeList } from '@eqv/views';
import { useReplayScreen } from '../use-replay-input.js';
import { TrustLine, stateFor } from './states.js';
import { EquipmentBar, useEquipmentOptions } from './EquipmentBar.js';

type Scene = { state: SceneState; layout: EquipmentLayoutDocument | null } | { error: string };

function ComponentDetail({ layout, state, componentId }: { layout: EquipmentLayoutDocument; state: SceneState; componentId: string }) {
  const component = layout.components.find((c) => c.id === componentId);
  const activity = state.components.find((c) => c.componentId === componentId);
  if (!component) return <EmptyState size="sm" icon={<MousePointerClick className="size-4" aria-hidden />} title={`Component ${componentId}를 찾을 수 없습니다`} />;
  return (
    <section aria-label={`Component 상세 ${component.id}`} className="text-text-primary">
      <FieldRow label="Component" layout="property">{component.id}</FieldRow>
      <FieldRow label="라벨" layout="property">{component.label}</FieldRow>
      <FieldRow label="역할" layout="property">{component.role}</FieldRow>
      <FieldRow label="활동" layout="property">
        {activity ? <>{ACTIVITY_KO[activity.activity as keyof typeof ACTIVITY_KO] ?? '기록된 활동 없음'} · 활동 근거 <Evidence level={activity.activityEvidence} /></> : '이 시점에 Binding이 없어 알 수 없음'}
      </FieldRow>
    </section>
  );
}

/**
 * The Focus entry keys for "Focus 열기" (analytics-platform ADR-0094): `job` plus the RecordSequence string of an Occurrence open at the cursor, so Focus opens on it. The selected Component's own
 * activity Occurrence first, then a material held there, then any activity or material Occurrence at the cursor (ids sorted by code
 * unit, so the choice is deterministic). None open: no entry keys, and Focus shows the whole window.
 */
function focusEntry(state: SceneState, batch: OccurrenceBatch, componentId: string | null): { entityType: string; anchor: string } | null {
  const own = componentId === null ? [] : [
    ...state.components.filter((c) => c.componentId === componentId).flatMap((c) => c.occurrenceIds),
    ...state.materials.filter((m) => m.location?.componentId === componentId).map((m) => m.occurrenceId),
  ];
  const any = [...state.components.flatMap((c) => c.occurrenceIds), ...state.materials.map((m) => m.occurrenceId)].sort();
  const id = own[0] ?? any[0];
  const occurrence = batch.occurrences.find((o) => o.id === id);
  return occurrence === undefined ? null : { entityType: 'job', anchor: String(occurrence.start.seq) };
}

function sceneAt(input: ReplayInput, to: SiteWallClock): Scene {
  try {
    const state = seekSceneState(input, to);
    return { state, layout: bindingLayout(input, state.binding) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * `eqv:topview` (the primary screen). The layout effective at the end of the applied window with the scene state as of `to`
 * (`seekSceneState`, evidence labels exactly as the reducer gives them). A selected Component's detail opens in the platform `DetailDrawer` (it closes on equipment, time or server-generation change, close and unmount).
 */
function TopViewBody() {
  const { resolveLink, navigate } = usePlatform();
  const { lang } = useI18n();
  const { props, load, resetKey, generation, retry: retryLoad } = useReplayScreen();
  const { state: optionsState, refreshing, failed: listFailed, retry } = useEquipmentOptions();
  const [selection, setSelection] = useState<{ key: string; id: string | null }>({ key: resetKey, id: null });
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  const input = load?.kind === 'ready' ? load.input : null;
  const to = props.time.kind === 'applied' ? props.time.to : null;
  const scene = useMemo(() => input && to ? sceneAt(input, to) : null, [input, to]);
  const ready = scene && !('error' in scene) ? scene : null;
  const replay = useMemo((): ReplayOverlay | null => ready ? { state: ready.state } : null, [ready]);
  // The selection belongs to the load: another equipment, window or server generation clears it.
  const selectionKey = JSON.stringify([resetKey, generation]);
  if (selection.key !== selectionKey) setSelection({ key: selectionKey, id: null });
  const selectedId = selection.key === selectionKey ? selection.id : null;

  const bar = <EquipmentBar props={props} state={optionsState} refreshing={refreshing} retry={retry} />;
  const state = props.equipment === null && listFailed
    ? <StateMessage icon={<ServerCrash className="size-4" aria-hidden />} title="설비 목록을 다시 불러오세요" body="위의 다시 시도를 누르세요." />
    : stateFor(props, load, 'topview', retryLoad);
  if (state !== null || load?.kind !== 'ready' || props.equipment === null) return <>{bar}<div>{state}</div></>;
  const { equipment } = props;
  if (scene === null || 'error' in scene) return <>{bar}<StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={`Replay 오류: ${scene?.error ?? ''}`} /></>;
  return (
    <>
      {bar}
      <TrustLine trust={load.trust} assessments={load.assessments} />
      <NoticeList notices={load.notices} />
      {scene.layout && selectedId !== null && (
        <DetailDrawer title={`Component · ${selectedId}`} onClose={() => setSelection({ key: selectionKey, id: null })}
          tabs={[{ id: 'detail', label: lang === 'ko' ? '상세' : 'Detail', content: <ComponentDetail layout={scene.layout} state={scene.state} componentId={selectedId} /> }]} />
      )}
      <div className="flex flex-wrap items-start gap-4">
        <Panel title="Top View" subtitle={wallClockText(scene.state.at)} className="max-w-full min-w-0 flex-none overflow-auto"
          actions={<>
            <span ref={setZoomHost} className="contents" />
            <Button variant="secondary" size="toolbar" onClick={() => { const link = resolveLink('eqv:focus', { page: { equipment, ...focusEntry(scene.state, load.input.batch, selectedId) } }); if (link.allowed) navigate(link.href, { focus: 'page', via: 'link' }); }}><ArrowRight className="size-3.5" aria-hidden />Focus 열기</Button>
          </>}>
          {scene.layout ? (
            <TopViewer layout={scene.layout} width={720} height={420} replay={replay} selectedId={selectedId}
              onSelectedChange={(id) => setSelection({ key: selectionKey, id })}
              renderControls={(controls) => zoomHost && createPortal(<ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />, zoomHost)} />
          ) : <EmptyState size="sm" icon={<MapPinOff className="size-4" aria-hidden />} title="이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다" />}
        </Panel>
        <div className="min-w-0 flex-1 basis-96">
          <CursorStateList state={scene.state} />
        </div>
      </div>
    </>
  );
}

/** The platform page frame (page title, Context bar) around the board. */
export function TopViewScreen() {
  return <PlatformPage title="설비 Top View"><TopViewBody /></PlatformPage>;
}
