import { describe, expect, it } from 'vitest';
import { AUDIT_TYPE_TOKEN, FILTER_TEXT_PATTERN } from '../audit-query.js';
import { MENU_ID_PATTERN } from '../usage.js';
import { platformVocab } from './platform-vocab.js';

describe('port input patterns vs @ap/contracts/vocab.json (FEA-12)', () => {
  it('pins audit type, menu id and filter text syntax including regex flags', () => {
    expect(platformVocab().portInputPatterns).toEqual({
      auditType: { source: AUDIT_TYPE_TOKEN.source, flags: AUDIT_TYPE_TOKEN.flags },
      menuId: { source: MENU_ID_PATTERN.source, flags: MENU_ID_PATTERN.flags },
      filterText: { source: FILTER_TEXT_PATTERN.source, flags: FILTER_TEXT_PATTERN.flags },
    });
  });
});
