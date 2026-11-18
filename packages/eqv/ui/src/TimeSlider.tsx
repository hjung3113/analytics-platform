import { useRef, type ChangeEvent, type KeyboardEvent } from 'react';

export interface TimeSliderProps {
  min: number;
  max: number;
  value: number;
  startLabel: string;
  currentLabel: string;
  endLabel: string;
  onValueChange: (value: number) => void;
  /** Fires once after a pointer or keyboard seek, not while the thumb is moving. */
  onValueCommit: (value: number) => void;
}

const KEYBOARD_STEP_DIVISOR = 100;
const LARGE_KEYBOARD_STEP_DIVISOR = 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isSliderKey = (key: string) => ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(key);

/** Wall-clock range control for EV replay; the host owns conversion, cursor state and URL commits. */
export function TimeSlider({ min, max, value, startLabel, currentLabel, endLabel, onValueChange, onValueCommit }: TimeSliderProps) {
  const interactionStart = useRef<number | null>(null);
  const beginInteraction = () => { interactionStart.current ??= value; };
  const finishInteraction = (next: number) => {
    const start = interactionStart.current;
    interactionStart.current = null;
    if (start !== null && next !== start) onValueCommit(next);
  };

  const change = (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.currentTarget.valueAsNumber);
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isSliderKey(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    beginInteraction();
    const smallStep = Math.max(1, Math.round((max - min) / KEYBOARD_STEP_DIVISOR));
    const largeStep = Math.max(smallStep, Math.round((max - min) / LARGE_KEYBOARD_STEP_DIVISOR));
    let next: number;
    switch (event.key) {
      case 'Home': next = min; break;
      case 'End': next = max; break;
      case 'ArrowRight':
      case 'ArrowUp': next = clamp(value + smallStep, min, max); break;
      case 'PageUp': next = clamp(value + largeStep, min, max); break;
      case 'PageDown': next = clamp(value - largeStep, min, max); break;
      case 'ArrowLeft':
      case 'ArrowDown': next = clamp(value - smallStep, min, max); break;
      default: return;
    }
    if (next !== value) onValueChange(next);
  };
  const keyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isSliderKey(event.key)) finishInteraction(event.currentTarget.valueAsNumber);
  };
  const pointerDown = () => beginInteraction();
  const pointerCancel = () => { interactionStart.current = null; };

  return (
    <div className="grid min-w-56 flex-1 gap-0.5">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label="재생 커서 시각"
        aria-valuetext={currentLabel}
        onChange={change}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        onPointerDown={pointerDown}
        onPointerUp={(event) => finishInteraction(event.currentTarget.valueAsNumber)}
        onPointerCancel={pointerCancel}
        onBlur={(event) => finishInteraction(event.currentTarget.valueAsNumber)}
        className="eqv-time-slider h-5 w-full cursor-pointer rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs tabular-nums text-text-secondary">
        <span>{startLabel}</span>
        <span className="font-medium text-text-primary">{currentLabel}</span>
        <span className="text-right">{endLabel}</span>
      </div>
    </div>
  );
}
