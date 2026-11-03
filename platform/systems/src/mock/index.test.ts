import { describe, expect, it } from 'vitest';
import { systemsMock } from './index';

describe('systems mock registration', () => {
  it('registers no endpoint: the screen reads the feature API, so the mock preview shows 실서버 필요', () => {
    expect(systemsMock).toEqual([]);
  });
});
