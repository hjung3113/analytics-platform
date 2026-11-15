import type { ReactNode } from 'react';
import type { Attempt } from './contracts';

/** Text of an attempt's RuleSet state when it names no single Revision (design log-rules §6.3 «연동 표시»): words, never colour alone. */
export const RULE_SET_STATE_TEXT = {
  ambiguous: '여러 RuleSet에 해당 — 연결하지 않음',
  unknown: '카탈로그에 없음',
  no_catalog: '카탈로그 미수신',
  unavailable: '규칙 세트를 확인하지 못함',
  none: '—',
} as const;

/**
 * The RuleSet the attempt's stored revision string names, as the server resolved it against the rule catalog (read-only; results are not
 * re-judged). Only `matched` links, and only to the RuleSet history of the validation rules menu through the host-supplied link component.
 */
export function RuleSetCell({ attempt, RuleSetLink, truncate = false }: { attempt: Pick<Attempt, 'ruleSet'>; RuleSetLink?: ((p: { ruleSetKey: string; children: ReactNode }) => ReactNode) | undefined; truncate?: boolean }) {
  const state = attempt.ruleSet;
  if (!state) return <span>{RULE_SET_STATE_TEXT.none}</span>;
  if (state.state !== 'matched') return <span className="text-text-secondary">{RULE_SET_STATE_TEXT[state.state]}</span>;
  const text = `${state.ruleSetKey} · ${state.revision}`;
  // In a table cell the name truncates (full text in the title) so the column keeps its width; the compact list wraps it.
  const label = truncate ? <span className="block min-w-0 truncate font-mono text-xs" title={text}>{text}</span> : <span className="font-mono text-xs break-all">{text}</span>;
  return <span className={truncate ? 'flex min-w-0 items-center gap-1.5' : 'inline-flex min-w-0 flex-wrap items-center gap-1.5'}>
    {RuleSetLink ? <RuleSetLink ruleSetKey={state.ruleSetKey}>{label}</RuleSetLink> : label}
    {!state.isCurrent && <span className="shrink-0 text-xs text-text-secondary">현재 아님</span>}
  </span>;
}
