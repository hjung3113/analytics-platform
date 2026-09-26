import { describe, expect, it } from 'vitest';
import { isAppRelativePath } from '@ap/contracts';
import { registry } from './menus';

const { safeReturnTo } = registry;

const cycle = '/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';

describe('safeReturnTo', () => {
  it('rejects open redirects and non-routes', () => {
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('https://evil.example/phish')).toBeNull();
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    expect(safeReturnTo('javascript:alert(1)')).toBeNull();
    expect(safeReturnTo('/unregistered')).toBeNull();
    expect(safeReturnTo('/equipment/X')).toBeNull();
    expect(safeReturnTo('/equipment/X?tab=attributes')).toBeNull();
    expect(safeReturnTo('/analytics/cycle-time?v=2&scopeId=ICH')).toBeNull();
    expect(safeReturnTo('/%2F%2Fevil.example')).toBeNull();
    expect(safeReturnTo('/equipment\u0000')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
  });

  it('keeps a registered non-detail URL whose query parses', () => {
    expect(safeReturnTo(cycle)).toBe(cycle);
    expect(safeReturnTo('/equipment?v=1&scopeId=ICH')).toBe('/equipment?v=1&scopeId=ICH');
    expect(safeReturnTo('/')).toBe('/');
  });

  it('does not treat a detail path as an app-relative failure', () => {
    expect(isAppRelativePath('/equipment/X')).toBe(true);
    expect(safeReturnTo('/equipment/X')).toBeNull();
    expect(isAppRelativePath('https://evil.example')).toBe(false);
    expect(isAppRelativePath('//evil.example')).toBe(false);
  });
});
