"""Candidate, deliberately bounded Context/URL codec; no IO or authorization."""
from dataclasses import dataclass, replace
import json
import re
from typing import Optional, Tuple
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit


class ContractError(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def fail(code, message):
    raise ContractError(code, message)


def identifier(value):
    if not isinstance(value, str) or not value.strip():
        fail('invalid_id', 'ID must contain a non-whitespace character; correct the URL.')
    try:
        value.encode('utf-8', errors='strict')
    except UnicodeEncodeError:
        fail('invalid_id', 'ID must be valid Unicode (no lone surrogates); correct the URL.')
    return value


@dataclass(frozen=True)
class Condition:
    axis: str
    values: Tuple[str, ...]


@dataclass(frozen=True)
class ContextState:
    route: str
    scope_id: Optional[str] = None
    room_names: Optional[Tuple[str, ...]] = None
    condition: Optional[Condition] = None
    selection: Optional[Tuple[str, ...]] = None
    destination: Optional[str] = None
    extras: Tuple[Tuple[str, str], ...] = ()
    unapplied_globals: Tuple[Tuple[str, str], ...] = ()


# Capability-only route stubs. No menu registry or UI is implemented.
CAPABILITIES = {
    'context': frozenset(('room_names', 'condition', 'selection')),
    'equipment': frozenset(('room_names', 'condition', 'selection')),
    'reference': frozenset(),
}
FIELDS = {'stgroup': ('id',), 'team': ('id',), 'makerModel': ('maker', 'model')}
SINGLE = {'v', 'scopeId', 'equipmentGroup', 'roomSelection', 'equipmentSelection'}
REGISTERED = SINGLE | {'roomNames', 'selectedEquipmentIds', 'equipmentIds'}
# Registered axes outside this profile remain opaque and unapplied, not extras.
OUTSIDE_PROFILE = {'from', 'to', 'lotIds', 'ppid', 'recipeIds', 'metricId',
                   'metricVersion', 'savedViewToken', 'anchor', 'entityType'}
REGISTERED |= OUTSIDE_PROFILE


def json_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            fail('invalid_condition', 'Duplicate JSON key; provide one Condition axis.')
        obj[key] = value
    return obj


def decode_condition(raw):
    try:
        obj = json.loads(raw, object_pairs_hook=json_object)
    except (ValueError, TypeError) as exc:
        fail('invalid_condition', 'Condition must be a JSON object: ' + str(exc))
    if not isinstance(obj, dict) or not isinstance(obj.get('axis'), str):
        fail('invalid_condition', 'Condition needs one registered axis.')
    axis = obj['axis']
    if axis not in FIELDS or set(obj) != {'axis', *FIELDS[axis]}:
        fail('invalid_condition', 'Use exactly one of stgroup, team, makerModel.')
    return Condition(axis, tuple(identifier(obj[key]) for key in FIELDS[axis]))


def parse_url(url):
    # Read only version fields before applying any v1 URL/route/field rules.
    if not isinstance(url, str):
        fail('invalid_url', 'Use an encoded local relative URL.')
    versions = []
    for field in url.partition('?')[2].split('#', 1)[0].split('&'):
        raw_key, _, raw_value = field.partition('=')
        if unquote(raw_key) == 'v':
            versions.append(unquote(raw_value.replace('+', ' ')))
    if any(re.fullmatch(r'[1-9][0-9]*', value) and value != '1' for value in versions):
        fail('unsupported_version', 'This decoder supports only v=1; do not rewrite the bookmark.')
    if any(not re.fullmatch(r'[1-9][0-9]*', value) for value in versions):
        fail('invalid_version', 'v must be a positive integer.')
    if len(versions) > 1:
        fail('duplicate_singleton', 'Only one value is allowed for v')
    if not isinstance(url, str) or re.search(r'[\x00-\x20\x7f]', url):
        fail('invalid_url', 'Use an encoded local relative URL.')
    if re.search(r'%(?![0-9A-Fa-f]{2})', url):
        fail('invalid_url', 'Malformed percent escape; correct the URL.')
    try:
        parts = urlsplit(url)
        if parts.scheme or parts.netloc or parts.fragment:
            fail('invalid_url', 'Only local relative URLs without fragments are supported.')
        pairs = parse_qsl(parts.query, keep_blank_values=True, encoding='utf-8', errors='strict')
        path = parts.path
        destination = None
        if path.startswith('/prototype/equipment/'):
            raw_id = path[len('/prototype/equipment/'):]
            if '/' in raw_id:
                fail('invalid_route', 'Encode the EquipmentID as one path segment.')
            destination = identifier(unquote(raw_id, encoding='utf-8', errors='strict'))
            route = 'equipment'
        elif path in ('/prototype/context', '/prototype/reference'):
            route = path.rsplit('/', 1)[1]
        else:
            fail('invalid_route', 'Use a registered prototype route.')
    except UnicodeError:
        fail('invalid_url', 'Invalid UTF-8 encoding; correct the URL.')
    query = {}
    for key, value in pairs:
        query.setdefault(key, []).append(value)
    for key in SINGLE:
        if len(query.get(key, [])) > 1:
            fail('duplicate_singleton', 'Only one value is allowed for ' + key)
    if 'equipmentIds' in query and 'selectedEquipmentIds' in query:
        fail('alias_conflict', 'Do not supply both EquipmentID selection aliases.')

    def read_set(key, marker):
        if marker in query:
            if query[marker] != ['none'] or key in query:
                fail('invalid_set', 'Empty-set marker conflicts with IDs or has an invalid value.')
            return ()
        if key not in query:
            return None
        return tuple(sorted({identifier(value) for value in query[key]}))

    scope = identifier(query['scopeId'][0]) if 'scopeId' in query else None
    condition = decode_condition(query['equipmentGroup'][0]) if 'equipmentGroup' in query else None
    selection_key = 'equipmentIds' if 'equipmentIds' in query else 'selectedEquipmentIds'
    return ContextState(route, scope, read_set('roomNames', 'roomSelection'), condition,
                        read_set(selection_key, 'equipmentSelection'), destination,
                        tuple((k, v) for k, v in pairs if k not in REGISTERED),
                        tuple((k, v) for k, v in pairs if k in OUTSIDE_PROFILE))


def serialize(state):
    """Canonical v1 URL; call with a parsed ContextState (or immutable replacement)."""
    if state.route not in CAPABILITIES:
        fail('invalid_route', 'Unknown capability route.')
    if (state.route == 'equipment') != (state.destination is not None):
        fail('invalid_route', 'Only the equipment route takes a destination ID.')
    path = '/prototype/' + state.route
    if state.destination is not None:
        path += '/' + quote(identifier(state.destination), safe='')
    pairs = [('v', '1')]
    if state.scope_id is not None:
        pairs.append(('scopeId', identifier(state.scope_id)))
    for key, marker, values in (('roomNames', 'roomSelection', state.room_names),
                                ('selectedEquipmentIds', 'equipmentSelection', state.selection)):
        if values is not None:
            if not values:
                pairs.append((marker, 'none'))
            else:
                pairs.extend((key, value) for value in sorted({identifier(v) for v in values}))
    if state.condition is not None:
        condition = state.condition
        if condition.axis not in FIELDS or len(condition.values) != len(FIELDS[condition.axis]):
            fail('invalid_condition', 'Invalid Condition shape.')
        obj = {'axis': condition.axis}
        obj.update(zip(FIELDS[condition.axis], map(identifier, condition.values)))
        pairs.append(('equipmentGroup', json.dumps(obj, ensure_ascii=False, separators=(',', ':'))))
    if any(k not in OUTSIDE_PROFILE for k, _ in state.unapplied_globals):
        fail('invalid_unapplied', 'Only registered out-of-profile fields can be preserved here.')
    pairs.extend(state.unapplied_globals)
    if any(k in REGISTERED for k, _ in state.extras):
        fail('invalid_extras', 'Registered fields cannot be supplied as extras.')
    pairs.extend(state.extras)
    url = path + '?' + urlencode(pairs, encoding='utf-8', errors='strict')
    parse_url(url)  # Same validation seam also guards newly constructed links.
    return url


def context_link(state, route, destination=None):
    """Transfer registered globals only; retain even unsupported Context."""
    return serialize(replace(state, route=route, destination=destination, extras=()))


def restore_context(origin_url):
    """Restore URL-owned source state; caller must revalidate on every request."""
    return parse_url(origin_url)
