import { useEffect, useRef, useState } from 'react';
import { usePlatform } from '@ap/kernel';
import { PlatformPage } from '@ap/components';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@ap/ui';
import { FocusView, type FocusTab } from '@eqv/views';
import { useReplayScreen } from '../use-replay-input.js';
import { TrustLine, stateFor } from './states.js';

/**
 * `eqv:focus`. Top View, Gantt and Occurrence list on one cursor over the applied time. The evidence of
 * the selected Occurrence stays in `FocusView`'s inline "근거 상세" tab. No Journey link: Journey is not
 * in the platform scope.
 */
function FocusBody() {
  const { pageParam, setPage, resolveLink, navigate } = usePlatform();
  const { props, load, resetKey } = useReplayScreen();
  const [tab, setTab] = useState<FocusTab>('list');
  const state = stateFor(props, load);
  // A saved range belongs to one (equipment, applied time, entry): when any of them changes under a mounted screen it is cleared, so it
  // cannot override the new window or entry. The first run keeps it (refresh / link restoration of the same context).
  const identity = JSON.stringify([resetKey, props.entityType, props.anchor]);
  const seen = useRef(identity);
  useEffect(() => {
    if (seen.current === identity) return;
    seen.current = identity;
    if (pageParam('rangeFrom') !== null || pageParam('rangeTo') !== null) setPage({ rangeFrom: null, rangeTo: null }, { replace: true });
  }, [pageParam, setPage, identity]);
  if (state !== null || load?.kind !== 'ready' || props.equipment === null) return <div>{state}</div>;
  const { equipment } = props;
  return (
    <>
    <TrustLine trust={load.trust} assessments={load.assessments} />
    <FocusView input={load.input} notices={load.notices} entityType={props.entityType} anchor={props.anchor} resetKey={resetKey}
      range={{ value: props.range, onChange: (range) => setPage({ rangeFrom: range.from, rangeTo: range.to }, { replace: true }) }}
      tab={tab} onTabChange={setTab}
      links={{ actions: <Button variant="secondary" size="toolbar" onClick={() => { const link = resolveLink('eqv:topview', { page: { equipment } }); if (link.allowed) navigate(link.href, { focus: 'page', via: 'link' }); }}><ArrowLeft className="size-3.5" aria-hidden />Top View로</Button> }} />
    </>
  );
}

/** The platform page frame (page title, Context bar) around the Focus view. */
export function FocusScreen() {
  return <PlatformPage title="Focus"><FocusBody /></PlatformPage>;
}
