import { useEffect, useState } from 'react';
import { layoutRevision, validateLayout } from '@eqv/core';
import { TopViewer } from '@eqv/renderer';
import { ViewerZoomControls } from '@eqv/ui';

/** Structural props: the host hands the Revision it read; this body checks it before drawing anything. */
export type ModelTopViewProps = { layoutId: string; revision: string; document: unknown };

/** Fixed drawing height of a profile section (CSS px); the width follows the section. */
export const MODEL_TOPVIEW_HEIGHT = 320;
const FALLBACK_WIDTH = 720;
export const DISCLOSURE = '개략도 · 실측 아님 · 제조사 도면 아님';
export const MISMATCH_TEXT = 'Top View를 확인할 수 없습니다 · Revision이 일치하지 않습니다';

type Checked = { status: 'checking' } | { status: 'error' } | { status: 'ok'; layout: Extract<ReturnType<typeof validateLayout>, { ok: true }>['layout'] };

/** Width of the element, following resizes; the viewer takes CSS px and has no observer of its own. */
function useWidth(node: HTMLElement | null): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    if (!node) return;
    const read = () => { const w = Math.floor(node.clientWidth); if (w > 0) setWidth(w); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return width;
}

export default function ModelTopViewBody({ layoutId, revision, document }: ModelTopViewProps) {
  const [checked, setChecked] = useState<{ key: string; value: Checked }>({ key: '', value: { status: 'checking' } });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const width = useWidth(host);
  const key = `${layoutId}|${revision}`;
  useEffect(() => {
    let live = true;
    const result = validateLayout(document);
    if (!result.ok) { setChecked({ key, value: { status: 'error' } }); return; }
    void layoutRevision(result.layout).then(
      hash => { if (live) setChecked({ key, value: hash === revision ? { status: 'ok', layout: result.layout } : { status: 'error' } }); },
      () => { if (live) setChecked({ key, value: { status: 'error' } }); },
    );
    return () => { live = false; };
  }, [key, revision, document]);
  // A result for another Revision is never shown for this one.
  const state: Checked = checked.key === key ? checked.value : { status: 'checking' };
  return <div className="min-w-0 overflow-hidden rounded-md border border-border-subtle bg-surface-card" data-testid="model-topview">
    {state.status === 'checking' && <p role="status" className="break-keep bg-surface-sunken px-3 py-4 text-sm text-text-secondary">Revision을 확인하는 중</p>}
    {state.status === 'error' && <p role="alert" className="break-keep bg-surface-sunken px-3 py-4 text-sm text-text-danger-label">{MISMATCH_TEXT}</p>}
    {state.status === 'ok' && <div ref={setHost} className="min-w-0 overflow-hidden">
      <TopViewer layout={state.layout} width={width} height={MODEL_TOPVIEW_HEIGHT}
        renderControls={controls => <ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />} />
    </div>}
    <p className="break-keep border-t border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary">{DISCLOSURE}</p>
  </div>;
}
