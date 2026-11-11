import type { ReactNode } from 'react';
import { CalendarClock, CalendarX2, Cpu, Inbox, ServerCrash, ShieldAlert } from 'lucide-react';
import type { Trust } from '@ap/contracts';
import { DataTrustIndicator, LoadingBlock, StateMessage } from '@ap/components';
import type { HostProps } from '../host-props.js';
import type { Trusted } from '../replay-load.js';
import type { ReplayLoad } from '../use-replay-input.js';

const icon = (Icon: typeof Cpu) => <Icon className="size-4" aria-hidden />;

/** What the line says about a read whose server sent assessments but no Trust (the mock replay reads): no time, no coverage, no claim beyond the assessments. */
const NO_TRUST: Trust = { updatedAt: '', dataThrough: null, coverage: null, provisional: false, source: '응답에 Trust가 없음' };

/**
 * The one Data Trust line of a read (EV#187): the assessments and Trust the server sent, with `unknown` never worded as clear.
 * A read with assessments but no Trust still gets its line, so «not verified» never looks like «nothing to report»; a read that said nothing at all gets none.
 */
export function TrustLine({ trust, assessments }: Trusted) {
  if (trust === null && assessments.length === 0) return null;
  return <div className="mb-3"><DataTrustIndicator trust={trust ?? NO_TRUST} assessments={assessments} wrap /></div>;
}

/** The state to show instead of the screen body, or null when the screen has verified data to draw. */
export function stateFor(props: HostProps, load: ReplayLoad | null, screen: 'topview' | 'focus' = 'focus'): ReactNode {
  const { time } = props;
  if (props.equipment === null) {
    return <StateMessage icon={icon(Cpu)} title={screen === 'topview' ? '위에서 설비를 고르세요' : 'Top View에서 설비를 고르세요'} />;
  }
  if (time.kind === 'missing') {
    return <StateMessage icon={icon(CalendarClock)} title="시간 구간을 고르세요" body="컨텍스트 바에서 시작·끝 시각을 적용하세요. 기본 구간을 대신 쓰지 않습니다." />;
  }
  if (time.kind === 'invalid') return <StateMessage tone="danger" icon={icon(CalendarX2)} title="시간 구간이 올바르지 않습니다" body={time.problem} />;
  if (load === null || load.kind === 'loading') return <LoadingBlock />;
  switch (load.kind) {
    case 'ready': return null;
    case 'empty':
      return <><TrustLine trust={load.trust} assessments={load.assessments} /><StateMessage icon={icon(Inbox)} title="이 구간에 표시할 Occurrence가 없습니다" body="선택한 설비와 시간 구간에 서버가 돌려준 데이터가 없습니다." /></>;
    case 'forbidden':
      return <StateMessage tone="warning" icon={icon(ShieldAlert)} title="접근 권한이 필요합니다" body="이 설비를 볼 권한이 없습니다." />;
    case 'failed':
      return <><TrustLine trust={load.trust} assessments={load.assessments} /><StateMessage tone={load.tone} icon={icon(ServerCrash)} title={load.title} body={load.message} {...(load.errorId === null ? {} : { correlationId: load.errorId })} /></>;
  }
}
