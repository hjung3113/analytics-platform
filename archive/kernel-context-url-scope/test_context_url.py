import unittest
from dataclasses import replace
from urllib.parse import urlencode
from context_url import (Condition, ContractError, ContextState, context_link,
                         parse_url, restore_context, serialize)
from fixture_server import FixtureServer

BASE = '/prototype/context?scopeId=scope-photo'


def sample(condition=Condition('stgroup', ('SG-photo',)), selection=('A', 'B')):
    return ContextState('context', 'scope-photo', ('PHOTO',), condition, selection)


class ContextContractTests(unittest.TestCase):
    def setUp(self):
        self.server = FixtureServer()

    def test_round_trip_all_group_axes_and_three_set_states(self):
        for condition in (None, Condition('stgroup', ('SG-photo',)), Condition('team', ('Team-A',)),
                          Condition('makerModel', ('Maker-X', 'Model-X'))):
            for rooms in (None, (), ('PHOTO',)):
                for selection in (None, (), ('A', 'B')):
                    with self.subTest(condition=condition, rooms=rooms, selection=selection):
                        state = replace(sample(condition, selection), room_names=rooms)
                        self.assertEqual(parse_url(serialize(state)), state)
                        url = serialize(state)
                        self.assertEqual(serialize(parse_url(url)), url)

    def test_unicode_order_reserved_chars_and_no_lossy_normalization(self):
        values = ['😀', '\ue000', 'A,B', 'a', ' A ', 'é', 'e\u0301', 'A/B&?', 'A,B']
        state = parse_url(BASE + '&' + urlencode([('selectedEquipmentIds', v) for v in values]))
        self.assertEqual(state.selection, tuple(sorted(set(values))))
        self.assertEqual(parse_url(serialize(state)), state)
        detail = parse_url(context_link(state, 'equipment', 'ID/공백 +?&'))
        self.assertEqual(detail.destination, 'ID/공백 +?&')
        self.assertEqual(detail.selection, state.selection)

    def test_alias_v1_canonicalization_and_duplicate_ids(self):
        state = parse_url(BASE + '&equipmentIds=B&equipmentIds=A&equipmentIds=A')
        self.assertEqual(state.selection, ('A', 'B'))
        self.assertIn('v=1', serialize(state))
        self.assertNotIn('&equipmentIds=', serialize(state))
        self.assertEqual(state, parse_url(serialize(state)))

    def test_reject_malformed_inputs(self):
        queries = ['v=0', 'v=01', 'v=-1', 'v=2', 'v=1&v=1', 'scopeId=x',
                   'selectedEquipmentIds=', 'selectedEquipmentIds=+++',
                   'equipmentIds=A&selectedEquipmentIds=A',
                   'equipmentIds=A&equipmentSelection=none',
                   'selectedEquipmentIds=A&equipmentSelection=none',
                   'roomNames=PHOTO&roomSelection=none', 'roomSelection=wrong',
                   'equipmentSelection=none&equipmentSelection=none',
                   'equipmentGroup=%7Bbad', 'equipmentGroup=%FF', 'roomNames=%ZZ']
        for query in queries:
            with self.subTest(query=query), self.assertRaises(ContractError):
                parse_url(BASE + '&' + query)
        for group in ('[]', '{"axis":"stgroup","id":""}',
                      '{"axis":"stgroup","id":"X","maker":"Y"}',
                      '{"axis":"stgroup","axis":"team","id":"X"}',
                      '{"axis":["stgroup"],"id":"X"}', '{"axis":"makerModel","maker":"X"}'):
            with self.subTest(group=group), self.assertRaises(ContractError):
                parse_url(BASE + '&' + urlencode({'equipmentGroup': group}))
        for url in ('https://example.test' + BASE, BASE + '#x', '/prototype/equipment/', BASE + '\n'):
            with self.subTest(url=url), self.assertRaises(ContractError):
                parse_url(url)

    def test_lone_surrogate_ids_rejected_as_contract_error(self):
        # JSON \ud800 escapes decode to a lone surrogate that cannot be UTF-8 encoded.
        with self.assertRaises(ContractError) as ctx:
            parse_url(BASE + '&' + urlencode({'equipmentGroup': '{"axis":"stgroup","id":"\\ud800"}'}))
        self.assertEqual(ctx.exception.code, 'invalid_id')
        for state in (sample(Condition('stgroup', ('\ud800',))),
                      replace(sample(), scope_id='\ud800'),
                      replace(sample(), room_names=('\ud800',)),
                      sample(selection=('\ud800',)),
                      ContextState('equipment', destination='\ud800')):
            with self.subTest(state=state), self.assertRaises(ContractError) as ctx:
                serialize(state)
            self.assertEqual(ctx.exception.code, 'invalid_id')

    def test_unknown_preserved_only_in_current_url(self):
        state = parse_url(BASE + '&unregistered=x&unregistered=y')
        self.assertEqual(parse_url(serialize(state)).extras, (('unregistered', 'x'), ('unregistered', 'y')))
        self.assertEqual(parse_url(context_link(state, 'reference')).extras, ())
        self.assertEqual(self.server.request(serialize(state))['equipmentIds'], ['A', 'B', 'C'])

    def test_registered_outside_profile_preserved_unapplied_across_routes(self):
        globals_ = (('from', '2026-09-24T00:00:00'), ('to', '2026-09-25T00:00:00'),
                    ('lotIds', 'L2'), ('lotIds', 'L1'), ('ppid', 'P'),
                    ('recipeIds', 'R'), ('metricId', 'M'), ('metricVersion', '3'),
                    ('savedViewToken', 'saved'), ('anchor', 'occurrence'), ('entityType', 'PRC'))
        origin = BASE + '&' + urlencode(globals_ + (('unknown', 'local'),))
        state = parse_url(origin)
        self.assertEqual(state.unapplied_globals, globals_)
        self.assertEqual(state.extras, (('unknown', 'local'),))
        self.assertEqual(parse_url(serialize(state)), state)
        for route, destination in (('reference', None), ('equipment', 'C'), ('context', None)):
            with self.subTest(route=route):
                link = context_link(state, route, destination)
                inherited = parse_url(link)
                self.assertEqual(inherited.unapplied_globals, globals_)
                self.assertEqual(inherited.extras, ())
                result = self.server.request(link)
                self.assertEqual(result['outcome'], 'ok')
                self.assertEqual(set(result['unapplied']), {key for key, _ in globals_})
                self.assertEqual(result['equipmentIds'], [] if route == 'reference' else ['A', 'B', 'C'])
        self.assertEqual(restore_context(origin), state)

    def test_review_single_from_probe_preserved_without_application(self):
        url = '/prototype/reference?scopeId=scope-photo&from=2026-09-24T00%3A00%3A00'
        state = parse_url(url)
        self.assertEqual(state.unapplied_globals, (('from', '2026-09-24T00:00:00'),))
        self.assertEqual(parse_url(serialize(state)), state)
        result = self.server.request(url)
        self.assertEqual(result['outcome'], 'ok')
        self.assertEqual(result['unapplied'], ['from'])
        self.assertEqual(result['equipmentIds'], [])

    def test_unsupported_version_precedes_other_format_errors(self):
        for version in ('2', '99'):
            for url in ('/prototype/context?v=VERSION&scopeId=a&scopeId=a',
                        '/prototype/other?v=VERSION',
                        '/prototype/equipment/?v=VERSION',
                        BASE + '&v=VERSION&equipmentGroup=%FF',
                        BASE + '&roomNames=%ZZ&v=VERSION',
                        BASE + '&v=VERSION&equipmentGroup=%7Bbad',
                        BASE + '&v=1&v=VERSION', BASE + '&v=VERSION#fragment',
                        '/prototype/other\n?v=VERSION'):
                url = url.replace('VERSION', version)
                with self.subTest(url=url), self.assertRaises(ContractError) as caught:
                    parse_url(url)
                self.assertEqual(caught.exception.code, 'unsupported_version')
                self.assertEqual(self.server.request(url)['code'], 'unsupported_version')

    def test_missing_scope_and_different_user(self):
        self.assertEqual(self.server.request('/prototype/equipment/A')['code'], 'scope_required')
        self.assertEqual(self.server.request(BASE, 'bob')['outcome'], 'forbidden')
        self.assertIsNone(self.server.request('/prototype/equipment/A')['siteConnection'])

    def test_room_scope_not_line_or_group_authority(self):
        result = self.server.request(serialize(sample()))
        self.assertEqual(result['equipmentIds'], ['A', 'B'])  # Different Lines, same room.
        for suffix in ('&roomNames=ETCH', '&selectedEquipmentIds=D'):
            self.assertEqual(self.server.request(BASE + suffix)['outcome'], 'forbidden')
        self.assertEqual(self.server.request(BASE + '&selectedEquipmentIds=missing')['outcome'], 'error')
        self.assertEqual(self.server.request(context_link(sample(), 'equipment', 'D'))['outcome'], 'forbidden')

    def test_condition_live_selection_fixed(self):
        for axis in (Condition('stgroup', ('SG-photo',)), Condition('team', ('Team-A',)),
                     Condition('makerModel', ('Maker-X', 'Model-X'))):
            self.assertEqual(self.server.request(serialize(sample(axis, None)))['equipmentIds'], ['A', 'B'])
        self.server.change_membership()
        fixed = self.server.request(serialize(sample()))
        self.assertEqual(fixed['equipmentIds'], ['A', 'B'])
        self.assertEqual(fixed['conditionEvaluation']['currentEquipmentIds'], ['B', 'C'])
        self.assertEqual(self.server.request(serialize(sample(selection=None)))['equipmentIds'], ['B', 'C'])

    def test_detail_outside_selection_and_restore_revalidation(self):
        origin = serialize(replace(sample(), extras=(('sourceOnly', 'keep'),)))
        detail = parse_url(context_link(parse_url(origin), 'equipment', 'C'))
        self.assertEqual(detail.destination, 'C')
        self.assertEqual(detail.selection, ('A', 'B'))
        self.assertEqual(self.server.request(serialize(detail))['outcome'], 'ok')
        restored = restore_context(origin)
        self.assertEqual(restored, parse_url(origin))
        self.server.grants['alice'].clear()
        self.assertEqual(self.server.request(serialize(restored))['outcome'], 'forbidden')
        self.assertEqual(restored.selection, ('A', 'B'))

    def test_empty_validates_other_inputs_first(self):
        self.assertEqual(self.server.request(BASE + '&equipmentSelection=none')['outcome'], 'empty')
        self.assertEqual(self.server.request(BASE + '&roomSelection=none')['outcome'], 'empty')
        for url in ('/prototype/context?scopeId=bad&equipmentSelection=none',
                    BASE + '&equipmentSelection=none&roomNames=ETCH',
                    BASE + '&roomSelection=none&selectedEquipmentIds=D',
                    context_link(sample(selection=()), 'equipment', 'D')):
            self.assertEqual(self.server.request(url)['outcome'], 'forbidden')
        result = self.server.request(BASE + '&roomSelection=none&selectedEquipmentIds=A')
        self.assertEqual(result['code'], 'selection_outside_room_filter')

    def test_unsupported_context_preserved_and_empty_not_applied(self):
        state = sample(selection=())
        link = context_link(state, 'reference')
        inherited = parse_url(link)
        self.assertEqual(inherited.selection, ())
        result = self.server.request(link)
        self.assertEqual(result['outcome'], 'ok')
        self.assertEqual(set(result['unapplied']), {'room_names', 'condition', 'selection'})
        self.assertEqual(self.server.request(serialize(restore_context(serialize(state))))['outcome'], 'empty')


if __name__ == '__main__':
    unittest.main(verbosity=2)
