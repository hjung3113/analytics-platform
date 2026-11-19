import { formatDateTime, formatRelativeTime, formatShortDateTime } from '../lib/format/datetime';
import { useHostSeam } from '../lib/host/host-seam';

export function FeatureTimestamp({ at, notation, className }: { at: string | null; notation: 'list' | 'summary' | 'feed'; className?: string }) {
  const { time } = useHostSeam();
  if (!at) return <span className={className}>—</span>;
  if (notation === 'feed') {
    const value = time?.feed(at) ?? { text: formatRelativeTime(at), title: formatDateTime(at) };
    return <time dateTime={at} title={value.title} className={className}>{value.text}</time>;
  }
  const text = notation === 'list' ? (time?.list(at) ?? formatDateTime(at)) : (time?.summary(at) ?? formatShortDateTime(at));
  return <time dateTime={at} className={className}>{text}</time>;
}
