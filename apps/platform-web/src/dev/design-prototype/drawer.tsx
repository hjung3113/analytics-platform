/**
 * #52 prototype — detail drawer (§20, throwaway). `variant` changes only width, top, push/overlay and tab chrome;
 * the field content is one. Opening a row sets the `focus` page key and never touches the global Selection.
 */
import { Maximize2, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { cn } from '@ap/ui';
import { type Equipment, FIELDS, STATUS_TEXT, wall } from './equipment-query';

export type Variant = 'A' | 'B' | 'C';

export const DRAWER: Record<Variant, { width: number; top: number; overlayBelow1440: boolean }> = {
  A: { width: 440, top: 0, overlayBelow1440: false },
  B: { width: 360, top: 44, overlayBelow1440: false },
  C: { width: 480, top: 56, overlayBelow1440: true },
};

const wideQuery = '(min-width: 1440px)';
function useWide() {
  return useSyncExternalStore(
    cb => { const m = window.matchMedia(wideQuery); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(wideQuery).matches,
  );
}

/** Right padding the page gives its content while the drawer is open (non-modal push). 0 when it overlays. */
export function useDrawerPush(variant: Variant, open: boolean) {
  const wide = useWide();
  if (!open) return 0;
  const d = DRAWER[variant];
  return d.overlayBelow1440 && !wide ? 0 : d.width;
}

type Tab = 'attributes' | 'validity' | 'audit';

export function EquipmentDrawer({ variant, id, row, onClose }: { variant: Variant; id: string; row: Equipment | null; onClose: () => void }) {
  const { linkTo } = usePlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const [tab, setTab] = useState<Tab>('attributes');
  const wide = useWide();
  const d = DRAWER[variant];
  const overlay = d.overlayBelow1440 && !wide;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (!overlay) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, [overlay]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'attributes', label: ko ? '속성' : 'Attributes' },
    { id: 'validity', label: ko ? '유효구간' : 'Validity' },
    { id: 'audit', label: 'Audit' },
  ];
  const pad = variant === 'A' ? 20 : variant === 'B' ? 12 : 24;
  const fullPage = linkTo('equipment-detail', { params: { equipmentId: id }, returnTo: true });

  const body = <>
    {overlay && <div aria-hidden onClick={onClose} className="fixed inset-0 z-[40]" style={{ top: d.top, background: 'rgba(10,37,64,.45)' }} />}
    <aside role={overlay ? 'dialog' : 'complementary'} aria-modal={overlay || undefined} aria-label={ko ? `설비 상세 ${id}` : `Equipment ${id}`}
      className="dp-pop fixed bottom-0 right-0 z-[45] flex flex-col bg-(--dp-surface)"
      style={{ top: d.top, width: d.width, borderLeft: '1px solid var(--dp-border)', boxShadow: overlay ? '-8px 0 24px rgba(10,37,64,.08)' : 'none' }}>
      <header style={{ padding: `${pad}px ${pad}px 0` }}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className={cn('dp-mono truncate font-semibold text-(--dp-text)', variant === 'A' ? 'text-[16px] leading-6' : variant === 'B' ? 'text-[14px] leading-5' : 'text-[20px] leading-7')}>{id}</h2>
            <p className="mt-0.5 truncate text-[12px] text-(--dp-muted)">{row ? row.name : (ko ? '현재 조회 결과에 없는 설비' : 'Not in the current result')}</p>
          </div>
          <PlatformLink href={fullPage} className={cn('inline-flex shrink-0 items-center gap-1 rounded-(--dp-radius) text-[12px] font-[560] text-(--dp-secondary) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)',
            variant === 'C' ? 'h-8 border border-(--dp-border) px-3' : 'h-7 px-2')}>
            <Maximize2 className="size-3.5" aria-hidden />{ko ? '전체 화면' : 'Full page'}
          </PlatformLink>
          <button type="button" onClick={onClose} aria-label={ko ? '닫기 (Esc)' : 'Close (Esc)'} title="Esc"
            className="grid size-7 shrink-0 place-items-center rounded-(--dp-radius) text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)"><X className="size-4" aria-hidden /></button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-(--dp-muted)">{ko ? '목적지 ID만 열었습니다. 전역 Selection과 목록 필터는 유지됩니다.' : 'Only the destination ID is opened. Global Selection and list filters are preserved.'}</p>
        <DrawerTabs variant={variant} tabs={tabs} value={tab} onChange={setTab} />
      </header>
      <div className="dp-scroll min-h-0 flex-1 overflow-y-auto" style={{ padding: `${variant === 'B' ? 8 : 12}px ${pad}px ${pad + 48}px` }}>
        {!row ? <p className="py-6 text-[13px] text-(--dp-muted)">{ko ? '목록 조회 결과에 이 설비가 없어 속성을 표시하지 않습니다. 전체 화면에서 확인하세요.' : 'This equipment is not in the list result. Open the full page to check it.'}</p>
          : tab === 'attributes' ? <Fields variant={variant} rows={FIELDS.map(f => [lang === 'ko' ? f.ko : f.en, value(row, f.key, lang), f.kind === 'id' || f.kind === 'time'])} />
            : tab === 'validity' ? <Fields variant={variant} rows={[
              [ko ? '유효 시작' : 'Valid from', wall(row.validFrom), true],
              [ko ? '유효 종료' : 'Valid to', row.validTo ? wall(row.validTo) : (ko ? '— (유효)' : '— (open)'), true],
              [ko ? '챔버 유형' : 'Chamber type', row.chamberType, false],
            ]} />
              : <>
                <Fields variant={variant} rows={[[ko ? '변경 시각' : 'Updated at', wall(row.updatedAt), true], [ko ? '변경자' : 'Updated by', row.updatedBy, true]]} />
                <p className="mt-3 rounded-(--dp-radius) bg-(--dp-canvas) px-3 py-2 text-[12px] leading-[18px] text-(--dp-muted)">{ko ? '프로토타입: 행의 변경 시각·변경자만. AuditTimeline은 본 구현에서 연결.' : 'Prototype: the row’s updated-at and updated-by only. AuditTimeline is wired in the real build.'}</p>
              </>}
      </div>
    </aside>
  </>;
  return createPortal(body, document.body);
}

function value(row: Equipment, key: keyof Equipment, lang: 'ko' | 'en') {
  if (key === 'status') return STATUS_TEXT[row.status][lang];
  if (key === 'validFrom' || key === 'validTo' || key === 'updatedAt') return wall(row[key]);
  return row[key] ?? '—';
}

function Fields({ variant, rows }: { variant: Variant; rows: [string, string, boolean][] }) {
  return <dl>
    {rows.map(([label, v, mono]) => <div key={label} className={cn('grid grid-cols-[120px_1fr] items-center gap-3 border-b border-(--dp-row-line)', variant === 'B' ? 'min-h-7' : variant === 'C' ? 'min-h-10' : 'min-h-9')}>
      <dt className={cn('text-(--dp-muted)', variant === 'B' ? 'text-[11px]' : 'text-[12px]')}>{label}</dt>
      <dd className={cn('min-w-0 truncate text-(--dp-text)', variant === 'B' ? 'text-[12px]' : 'text-[13px]', mono && 'dp-num', label.includes('ID') && 'dp-mono text-[12px]')}>{v}</dd>
    </div>)}
  </dl>;
}

function DrawerTabs({ variant, tabs, value, onChange }: { variant: Variant; tabs: { id: Tab; label: string }[]; value: Tab; onChange: (t: Tab) => void }) {
  if (variant === 'B') {
    return <div role="tablist" className="mt-3 flex h-[26px] w-fit gap-0.5 rounded-(--dp-radius-sm) bg-(--dp-chip-soft) p-0.5">
      {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
        className={cn('rounded-(--dp-radius-sm) px-2.5 text-[12px]', value === t.id ? 'bg-[var(--dp-seg-on,#111827)] text-white' : 'text-(--dp-secondary)')}>{t.label}</button>)}
    </div>;
  }
  return <div role="tablist" className={cn('mt-3 flex border-b border-(--dp-border)', variant === 'C' ? 'gap-5' : 'gap-4')}>
    {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
      className={cn('-mb-px border-b-2 pb-2 pt-1', variant === 'C' ? 'text-[14px]' : 'text-[13px]',
        value === t.id ? cn('font-[560] text-(--dp-text)', variant === 'C' ? 'border-(--dp-primary)' : 'border-(--dp-text)') : 'border-transparent text-(--dp-muted) hover:text-(--dp-text)')}>{t.label}</button>)}
  </div>;
}
