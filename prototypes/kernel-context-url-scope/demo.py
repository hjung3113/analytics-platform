"""Executable, asserted deep-link round trip using only synthetic fixtures."""
from dataclasses import asdict
import json
from context_url import context_link, parse_url, restore_context, serialize
from fixture_server import FixtureServer

origin = ('/prototype/context?scopeId=scope-photo&roomNames=PHOTO'
          '&equipmentGroup=%7B%22axis%22%3A%22stgroup%22%2C%22id%22%3A%22SG-photo%22%7D'
          '&selectedEquipmentIds=B&selectedEquipmentIds=A&selectedEquipmentIds=A')
server = FixtureServer()
state = parse_url(origin)
canonical = serialize(state)
assert parse_url(canonical) == state
print('INPUT:', origin)
print('STATE:', json.dumps(asdict(state), ensure_ascii=False))
print('CANONICAL:', canonical)
print('ROUND TRIP: PASS')
detail = context_link(state, 'equipment', 'C')
assert parse_url(detail).selection == ('A', 'B')
assert server.request(detail)['outcome'] == 'ok'
print('DETAIL C:', detail)
reference = context_link(state, 'reference')
reference_result = server.request(reference)
assert reference_result['outcome'] == 'ok'
assert len(reference_result['unapplied']) == 3
print('REFERENCE UNAPPLIED:', reference_result['unapplied'])
server.change_membership()
restored = restore_context(origin)
assert restored == state
result = server.request(serialize(restored))
assert result['equipmentIds'] == ['A', 'B']
assert result['conditionEvaluation']['currentEquipmentIds'] == ['B', 'C']
print('RETURN FIXED SELECTION:', result['equipmentIds'])
print('CURRENT LIVE CONDITION:', result['conditionEvaluation'])
server.grants['alice'].clear()
result = server.request(serialize(restored))
assert result['outcome'] == 'forbidden'
assert restored.selection == ('A', 'B')
print('RETURN AFTER REVOKED GRANT:', result['outcome'], result['code'])
print('ALL DEMO ASSERTIONS: PASS (local fixtures only; no analytical query)')
