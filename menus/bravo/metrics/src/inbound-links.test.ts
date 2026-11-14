import { describe, expect, it } from 'vitest';
import { manifests } from './index';

describe('metric inbound destination (#1930)', () => {
  it('opens a metric definition id through its only route parameter, independently of metric Context', () => {
    const detail = manifests.find(menu => menu.id === 'metric-detail')!;
    expect(detail.opensObject).toEqual({ metric: { param: 'metricId' } });
    expect(detail.path.match(/:[^/]+/g)).toEqual([':metricId']);
  });
});
