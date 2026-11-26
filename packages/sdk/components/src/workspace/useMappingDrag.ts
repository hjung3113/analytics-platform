import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { sameChartConfig, type ChartConfig, type MappingChip, type MappingSlot, type Text } from '@ap/contracts';
import { usePointerDrag, watchBox } from './usePointerDrag';

const SLOT = '[data-mapping-slot]';
const CHIP = '[data-mapping-chip][data-mapping-chip-kind]';
type Preview = { chip: MappingChip; target: HTMLElement | undefined; slot: MappingSlot | undefined };
type Assign = (slot: MappingSlot, chip: MappingChip) => Text | undefined;

function mappingSlot(value: string | undefined): MappingSlot | undefined {
  return value === 'measure' || value === 'breakdown' ? value : undefined;
}

function samePreview(current: Preview | null, next: Preview | null) {
  return current?.target === next?.target && current?.slot === next?.slot && current?.chip === next?.chip;
}

export function useMappingDrag(config: ChartConfig, assign: Assign) {
  const gesture = usePointerDrag<Preview, Text>();
  const latest = useRef({ config, assign });
  const { cancel, clearStatus } = gesture;
  useLayoutEffect(() => {
    if (!sameChartConfig(latest.current.config, config)) { cancel(); clearStatus(); }
    latest.current = { config, assign };
  }, [config, assign, cancel, clearStatus]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const root = event.currentTarget;
    const source = event.target.closest<HTMLElement>(CHIP);
    const doc = root.ownerDocument;
    const id = source?.dataset.mappingChip;
    const kind = mappingSlot(source?.dataset.mappingChipKind);
    if (!source || !root.contains(source) || id === undefined || !kind) return;
    const chip = { id, kind };
    const hasSource = () => root.isConnected && root.contains(source)
      && source.dataset.mappingChip === id && source.dataset.mappingChipKind === kind;
    gesture.start(event, {
      source,
      isSourceAvailable: hasSource,
      sourceAttributes: ['data-mapping-chip', 'data-mapping-chip-kind'],
      geometry: changed => watchBox(root, changed),
      previewAt: point => {
        const target = doc.elementFromPoint?.(point.clientX, point.clientY)?.closest<HTMLElement>(SLOT);
        const well = target && root.contains(target) ? target : undefined;
        return { chip, target: well, slot: mappingSlot(well?.dataset.mappingSlot) };
      },
      samePreview,
      // The release judges the well under the pointer, not whether the first preview had rendered.
      sameDrop: (rendered, fresh) => rendered?.target === fresh?.target && rendered?.slot === fresh?.slot,
      onDrop: rendered => {
        if (!rendered.slot) return 'skip';
        return latest.current.assign(rendered.slot, chip) || undefined;
      },
      onRelease: () => {
        if (!hasSource()) return;
        if (doc.activeElement === doc.body) (source.closest<HTMLElement>(SLOT) ?? source).focus({ preventScroll: true });
      },
    });
  }

  return { onPointerDown, preview: gesture.preview, status: gesture.status };
}
