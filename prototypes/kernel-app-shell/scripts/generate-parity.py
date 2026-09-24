"""Read-only source codec oracle. 합성 fixture, 실제 메뉴 아님."""
import json
import runpy
from pathlib import Path
from urllib.parse import urlencode
from dataclasses import asdict

root = Path(__file__).resolve().parents[1]
codec = runpy.run_path(str(root.parent / 'kernel-context-url-scope/context_url.py'))
urls = []
for condition in (None, {'axis': 'stgroup', 'id': 'fixture-group'}, {'axis': 'team', 'id': 'fixture-team'}, {'axis': 'makerModel', 'maker': 'M', 'model': 'X'}):
    for room in (None, [], ['PHOTO']):
        for selection in (None, [], ['A', 'B']):
            pairs = [('scopeId', 'fixture-scope-a')]
            for key, marker, values in [('roomNames', 'roomSelection', room), ('selectedEquipmentIds', 'equipmentSelection', selection)]:
                if values == []:
                    pairs.append((marker, 'none'))
                elif values:
                    pairs.extend((key, v) for v in values)
            if condition:
                pairs.append(('equipmentGroup', json.dumps(condition)))
            urls.append('/prototype/context?' + urlencode(pairs))
base = '/prototype/context?scopeId=fixture-scope-a'
for suffix in ['v=0', 'v=01', 'v=-1', 'v=2', 'v=1&v=1', 'scopeId=x', 'selectedEquipmentIds=', 'selectedEquipmentIds=+++', 'equipmentIds=A&selectedEquipmentIds=A', 'equipmentIds=A&equipmentSelection=none', 'selectedEquipmentIds=A&equipmentSelection=none', 'roomNames=PHOTO&roomSelection=none', 'roomSelection=wrong', 'equipmentSelection=none&equipmentSelection=none', 'equipmentGroup=%7Bbad', 'equipmentGroup=%FF', 'roomNames=%ZZ', 'unregistered=x&unregistered=y', 'from=2026-09-24T00%3A00%3A00', 'equipmentIds=B&equipmentIds=A&equipmentIds=A']:
    urls.append(base + '&' + suffix)
for group in ['[]', '{"axis":"stgroup","id":""}', '{"axis":"stgroup","id":"X","maker":"Y"}', '{"axis":"stgroup","axis":"team","id":"X"}', '{"axis":["stgroup"],"id":"X"}', '{"axis":"makerModel","maker":"X"}', '{"axis":"team","\\u0069d":"A","id":"B"}']:
    urls.append(base + '&' + urlencode({'equipmentGroup': group}))
urls.extend(['https://example.test' + base, base + '#x', '/prototype/equipment/', base + '\n', '/prototype/equipment/A/B', '/prototype/equipment/%FF', '/prototype/equipment/ID%2F%EA%B3%B5%EB%B0%B1%20%2B%3F%26'])
for version in ('2', '99'):
    for url in ['/prototype/context?v=VERSION&scopeId=a&scopeId=a', '/prototype/other?v=VERSION', '/prototype/equipment/?v=VERSION', base + '&v=VERSION&equipmentGroup=%FF', base + '&roomNames=%ZZ&v=VERSION', base + '&v=VERSION&equipmentGroup=%7Bbad', base + '&v=1&v=VERSION', base + '&v=VERSION#fragment', '/prototype/other\n?v=VERSION']:
        urls.append(url.replace('VERSION', version))
urls.append(base + '&' + urlencode([('selectedEquipmentIds', v) for v in ['😀', '\ue000', 'A,B', 'a', ' A ', 'é', 'e\u0301', 'A/B&?', 'A,B', "~!'()*"]]))
urls.append(base + '&' + urlencode([(key, 'opaque') for key in sorted(codec['OUTSIDE_PROFILE'])] + [('unknown', 'local')]))
for value in ['\u0085', '\ufeff', '\u001c', 'quote \"key\": value', 'backslash \\']:
    urls.append(base + '&' + urlencode({'equipmentGroup': json.dumps({'axis': 'team', 'id': value})}))
cases = []
for url in urls:
    try:
        state = codec['parse_url'](url)
        cases.append({'url': url, 'state': asdict(state), 'canonical': codec['serialize'](state), 'reference': codec['context_link'](state, 'reference'), 'detail': codec['context_link'](state, 'equipment', 'ID/공백 +?&')})
    except codec['ContractError'] as error:
        cases.append({'url': url, 'error': error.code})
(root / 'src/parity-vectors.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2) + '\n')
print(f'Generated {len(cases)} vectors from unchanged Python codec')
