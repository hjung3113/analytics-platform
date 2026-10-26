"""Local server validation double, NOT production auth, DB, or group integration."""
from uuid import uuid4
from context_url import CAPABILITIES, ContractError, parse_url


class FixtureServer:
    def __init__(self):
        # Explicit room grants, no parent-child inheritance or Site-from-ID lookup.
        self.scopes = {'scope-photo': ('site-korea-db', frozenset({'PHOTO'}))}
        self.grants = {'alice': {'scope-photo'}, 'bob': set()}
        self.databases = {'site-korea-db': {
            'A': dict(room='PHOTO', line='L1', stgroup='SG-photo', team='Team-A', maker='Maker-X', model='Model-X'),
            'B': dict(room='PHOTO', line='L2', stgroup='SG-photo', team='Team-A', maker='Maker-X', model='Model-X'),
            'C': dict(room='PHOTO', line='L2', stgroup='SG-other', team='Team-B', maker='Maker-X', model='Model-Y'),
            'D': dict(room='ETCH', line='L1', stgroup='SG-etch', team='Team-B', maker='Maker-X', model='Model-X'),
        }}
        self.evaluated_at = '2026-09-24T09:00:00+09:00'

    def request(self, url, user='alice'):
        """Parse at the server seam on every request; no trust in prior client state."""
        result = dict(outcome='error', code=None, correlationId=str(uuid4()),
                      siteConnection=None, equipmentIds=[], unapplied=[], conditionEvaluation=None)

        def finish(outcome, code):
            result.update(outcome=outcome, code=code)
            return result

        try:
            state = parse_url(url)
        except ContractError as exc:
            result['message'] = str(exc)
            return finish('error', exc.code)
        if state.scope_id is None:
            return finish('selection_required', 'scope_required')
        if state.scope_id not in self.scopes or state.scope_id not in self.grants.get(user, set()):
            return finish('forbidden', 'scope_forbidden')
        connection, allowed_rooms = self.scopes[state.scope_id]
        result['siteConnection'] = connection
        db = self.databases[connection]  # Scope establishes Site BEFORE any EquipmentID use.
        applied = CAPABILITIES[state.route]
        result['unapplied'] = [key for key in ('room_names', 'condition', 'selection')
                               if getattr(state, key) is not None and key not in applied]
        result['unapplied'].extend(sorted({key for key, _ in state.unapplied_globals}))
        rooms = state.room_names if 'room_names' in applied else None
        selection = state.selection if 'selection' in applied else None
        condition = state.condition if 'condition' in applied else None
        if rooms is not None and not set(rooms) <= allowed_rooms:
            return finish('forbidden', 'room_forbidden')
        # Validate all explicit IDs before empty-set handling; never silently trim.
        for equipment_id in tuple(selection or ()) + ((state.destination,) if state.destination else ()):
            if equipment_id not in db:
                return finish('error', 'equipment_not_found')
            if db[equipment_id]['room'] not in allowed_rooms:
                return finish('forbidden', 'equipment_forbidden')
        if selection and rooms is not None and any(db[e]['room'] not in rooms for e in selection):
            return finish('error', 'selection_outside_room_filter')
        # A reference route doesn't run an equipment lookup for unapplied context.
        if state.route == 'reference':
            return finish('ok', 'context_preserved_not_applied')
        candidates = {e for e, row in db.items()
                      if row['room'] in allowed_rooms and (rooms is None or row['room'] in rooms)}
        if condition is not None:
            def matches(row):
                if condition.axis == 'makerModel':
                    return (row['maker'], row['model']) == condition.values
                return row[condition.axis] == condition.values[0]
            current = {e for e in candidates if matches(db[e])}
            result['conditionEvaluation'] = dict(mode='live', evaluatedAt=self.evaluated_at,
                                                 currentEquipmentIds=sorted(current), source='local-fixture')
        else:
            current = candidates
        # Current group result MUST NOT intersect, expand, or replace explicit Selection.
        ids = set(selection) if selection is not None else current
        result['equipmentIds'] = sorted(ids)
        return finish('ok' if ids else 'empty', 'validated_fixture')

    def change_membership(self):
        self.databases['site-korea-db']['A']['stgroup'] = 'SG-other'
        self.databases['site-korea-db']['C']['stgroup'] = 'SG-photo'
        self.evaluated_at = '2026-09-24T09:05:00+09:00'
