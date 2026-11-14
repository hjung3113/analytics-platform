import { describe, expect, it } from 'vitest';
import * as host from '../host';
import { chartTheme, EChart, token } from '../chart/EChart';
import manifest from '../../package.json';

describe('host chart entry', () => {
  it('exposes the existing engine through the declared host subpath', () => {
    expect(manifest.exports['./host']).toBe('./src/host.ts');
    expect(host.EChart).toBe(EChart);
    expect(host.chartTheme).toBe(chartTheme);
    expect(host.token).toBe(token);
  });
});
