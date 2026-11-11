import { Fragment } from 'react';
import { rangeShort, wallClockShort } from '../../model/onboarding';

const STAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}/g;

/** Text with Site Wall-clock values that never break inside a timestamp (`break-keep` still breaks after «-»). */
export function NoBreakStamps({ text }: { text: string }) {
  const parts: (string | { stamp: string })[] = [];
  let at = 0;
  for (const match of text.matchAll(STAMP)) {
    if (match.index > at) parts.push(text.slice(at, match.index));
    parts.push({ stamp: match[0] });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts.map((part, i) => (typeof part === 'string' ? <Fragment key={i}>{part}</Fragment> : <span key={i} className="whitespace-nowrap">{part.stamp}</span>))}</>;
}

/** A Site Wall-clock value in short form where space is tight; the full value is the `title`. */
export function ShortWallClock({ value }: { value: string }) {
  return <span className="whitespace-nowrap" title={value}>{wallClockShort(value)}</span>;
}

/** A window range in short form on one line; the full range is the `title`. */
export function ShortRange({ from, to }: { from: string; to: string }) {
  return <span className="whitespace-nowrap" title={`${from} – ${to}`}>{rangeShort(from, to)}</span>;
}
