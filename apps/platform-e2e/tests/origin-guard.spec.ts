import { expect, test } from './origin-guard';
import { foreignRequests } from './origin-guard';

test.describe('같은 출처 밖 요청 없음 (#2897, #1705 §3)', () => {
  test('다른 출처 요청을 판정한다', () => {
    const base = 'http://127.0.0.1:4190';
    expect(foreignRequests([
      'http://127.0.0.1:4190/mars/home', 'data:image/png;base64,AA', 'blob:http://127.0.0.1:4190/x', 'about:blank',
      'http://127.0.0.1:4191/other-port', 'https://fonts.example.invalid/a.woff2',
    ], base)).toEqual(['http://127.0.0.1:4191/other-port', 'https://fonts.example.invalid/a.woff2']);
  });

  // Self-test: a planted request to another origin must fail the test through the auto fixture alone.
  test.fail('심어 둔 다른 출처 요청 하나가 시험을 실패시킨다', async ({ page }) => {
    await page.evaluate(() => fetch('http://other-origin.invalid/beacon').catch(() => null));
  });
});
