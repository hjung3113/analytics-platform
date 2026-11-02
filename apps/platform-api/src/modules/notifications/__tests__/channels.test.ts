import { describe, expect, it } from 'vitest';

import { MockEmailChannel } from '../channels.js';

describe('MockEmailChannel logging', () => {
  it('logs bounded metadata only: no summary and no recipient email', async () => {
    const lines: string[] = [];
    const capture = (msg: string, meta?: Record<string, unknown>) =>
      void lines.push(JSON.stringify({ msg, meta }));
    const channel = new MockEmailChannel({ info: capture, warn: capture, error: capture });
    await channel.send({
      workspace_id: 'w-1',
      actor_id: 'a-1',
      event_type: 'task_request.rejected',
      subject_type: 'task_request',
      subject_id: 's-1',
      locale: 'ko-KR',
      summary: 'DISTINCTIVE-SUMMARY-9f3a',
      in_app: true,
      email: true,
      recipient_email: 'distinctive-recipient@example.test',
    });
    expect(lines).toHaveLength(1);
    const output = lines.join('\n');
    expect(output).not.toContain('DISTINCTIVE-SUMMARY-9f3a');
    expect(output).not.toContain('distinctive-recipient@example.test');
    expect(output).toContain('a-1');
  });
});
