#!/usr/bin/env python3
"""test-app-preview.py — ownership checks in app-preview.py stop/status, with fake ps and signals. Run: python3 test-app-preview.py"""
import importlib.util
import json
import os
import signal
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SPEC = importlib.util.spec_from_file_location('app_preview', Path(__file__).with_name('app-preview.py'))
ap = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ap)

LS = 'Mon Oct  5 09:00:00 2026'
CMD = 'pnpm --filter @ap/platform-web exec vite --host 127.0.0.1 --port 5180 --strictPort'
RECORD = {'lstart': LS, 'command': CMD}
OTHER_LS = 'Tue Oct  6 23:11:47 2026'
OTHER_CMD = '/bin/zsh -lc something-else'


def vite(port):
    return f'node /checkouts/w/node_modules/.bin/vite --host 127.0.0.1 --port {port} --strictPort'


class FakePs:
    """Stands in for subprocess.run on every ps call app-preview.py makes."""

    def __init__(self, rows=(), sweep_fail=False):
        self.rows = list(rows)
        self.fields = {}
        self.sweep_fail = sweep_fail

    def run(self, cmd, capture_output=False, text=False):
        if cmd[:2] == ['ps', '-axo']:
            if self.sweep_fail and cmd[2] == 'pid=,pgid=,command=':
                return mock.Mock(returncode=1, stdout='')
            out = ''.join(f'{pid} {pgid} {command}\n' for pid, pgid, command in self.rows) \
                if cmd[2] == 'pid=,pgid=,command=' else ''
            return mock.Mock(returncode=0, stdout=out)
        if cmd[:2] == ['ps', '-o']:
            value = self.fields.get((int(cmd[4]), cmd[2]))
            if value is None:
                return mock.Mock(returncode=1, stdout='')
            return mock.Mock(returncode=0, stdout=value + '\n')
        return mock.Mock(returncode=0, stdout='')


class StopTest(unittest.TestCase):
    def stop(self, state_extra, rows, fields, dead_pids=(), dies_on_term=True,
             sweep_fail=False, rows_after_term=None, dead_after_term=()):
        ps = FakePs(rows, sweep_fail=sweep_fail)
        ps.fields.update(fields)
        dead = set(dead_pids)
        calls = []

        def killpg(pgid, sig):
            calls.append((pgid, sig))
            if sig == signal.SIGTERM:
                if rows_after_term is not None:
                    ps.rows = list(rows_after_term)
                    dead.update(dead_after_term)
                elif dies_on_term:
                    ps.rows = []

        def kill(pid, sig):
            if pid in dead:
                raise OSError(3, 'No such process')

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(ap, 'subprocess') as sub, \
                mock.patch.object(ap.os, 'kill', side_effect=kill), \
                mock.patch.object(ap.os, 'killpg', side_effect=killpg), \
                mock.patch.object(ap.time, 'sleep'):
            sub.run.side_effect = ps.run
            state_file = Path(tmp, 'preview-x.json')
            state_file.write_text('{}\n')
            result = ap.stop_one({'label': 'x', 'pid': 100, 'port': 5180, 'file': str(state_file), **state_extra})
            return result, calls, state_file.exists()

    def test_parent_alive_and_record_matches_kills_group(self):
        for dies in (True, False):
            with self.subTest(dies_on_term=dies):
                result, calls, exists = self.stop(
                    {'pgid': 100, **RECORD},
                    rows=[(100, 100, CMD), (205, 100, vite(5180))],
                    fields={(100, 'lstart='): LS, (100, 'command='): CMD},
                    dies_on_term=dies)
                self.assertTrue(result['ok'])
                self.assertEqual(calls, [(100, signal.SIGTERM)] if dies
                                 else [(100, signal.SIGTERM), (100, signal.SIGKILL)])
                self.assertFalse(exists)

    def test_orphan_vite_in_group_is_still_killed(self):
        result, calls, exists = self.stop(
            {'pgid': 100, **RECORD}, rows=[(205, 100, vite(5180))], fields={}, dead_pids={100})
        self.assertTrue(result['ok'])
        self.assertEqual(calls, [(100, signal.SIGTERM)])
        self.assertFalse(exists)

    def test_reused_pid_gets_no_signal_and_keeps_state(self):
        result, calls, exists = self.stop(
            {'pgid': 100, **RECORD},
            rows=[(100, 100, OTHER_CMD)],
            fields={(100, 'lstart='): OTHER_LS, (100, 'command='): OTHER_CMD})
        self.assertFalse(result['ok'])
        self.assertEqual(result['error'], 'ownership unclear')
        self.assertEqual(calls, [])
        self.assertTrue(exists)

    def test_foreign_vite_gets_no_signal(self):
        for name, rows in [('other port', [(205, 100, vite(5190))]),
                           ('no strictPort', [(205, 100, 'node vite --host 127.0.0.1 --port 5180')])]:
            with self.subTest(case=name):
                result, calls, exists = self.stop(
                    {'pgid': 100, **RECORD}, rows=rows, fields={}, dead_pids={100})
                self.assertFalse(result['ok'])
                self.assertEqual(calls, [])
                self.assertTrue(exists)

    def test_legacy_state_is_judged_by_vite_signature(self):
        for name, rows, owned in [('our vite in group', [(205, 100, vite(5180))], True),
                                  ('foreign group', [(205, 100, vite(5190))], False)]:
            with self.subTest(case=name):
                result, calls, exists = self.stop({}, rows=rows, fields={}, dead_pids={100})
                self.assertEqual(result['ok'], owned)
                self.assertEqual(calls, [(100, signal.SIGTERM)] if owned else [])
                self.assertEqual(exists, not owned)


    def test_parent_identification_failures_get_no_signal(self):
        cases = [
            ('recorded lstart null', {'pgid': 100, 'lstart': None, 'command': CMD},
             {(100, 'lstart='): LS, (100, 'command='): CMD}),
            ('recorded command null', {'pgid': 100, 'lstart': LS, 'command': None},
             {(100, 'lstart='): LS, (100, 'command='): CMD}),
            ('recorded both null', {'pgid': 100, 'lstart': None, 'command': None}, {}),
            ('field missing', {'pgid': 100, 'command': CMD}, {(100, 'command='): CMD}),
            ('recorded empty', {'pgid': 100, 'lstart': '', 'command': CMD},
             {(100, 'lstart='): LS, (100, 'command='): CMD}),
            ('lstart lookup fails', {'pgid': 100, **RECORD}, {(100, 'command='): CMD}),
            ('command lookup fails', {'pgid': 100, **RECORD}, {(100, 'lstart='): LS}),
            ('both lookups fail', {'pgid': 100, **RECORD}, {}),
            ('current empty', {'pgid': 100, **RECORD}, {(100, 'lstart='): LS, (100, 'command='): ''}),
        ]
        for name, extra, fields in cases:
            with self.subTest(case=name):
                result, calls, exists = self.stop(extra, rows=[(100, 100, CMD)], fields=fields)
                self.assertFalse(result['ok'])
                self.assertEqual(result['error'], 'ownership unclear')
                self.assertEqual(calls, [])
                self.assertTrue(exists)

    def test_group_replaced_after_term_gets_no_kill(self):
        result, calls, exists = self.stop(
            {'pgid': 100, **RECORD},
            rows=[(100, 100, CMD), (205, 100, vite(5180))],
            fields={(100, 'lstart='): LS, (100, 'command='): CMD},
            rows_after_term=[(400, 100, OTHER_CMD)],
            dead_after_term={100})
        self.assertFalse(result['ok'])
        self.assertEqual(calls, [(100, signal.SIGTERM)])
        self.assertTrue(exists)

    def test_vite_signature_is_token_exact(self):
        cases = [
            ('pnpm exec form', CMD, True),
            ('vite.js child form',
             'node /checkouts/w/node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180 --strictPort', True),
            ('port equals form',
             'node /checkouts/w/node_modules/.bin/vite --host 127.0.0.1 --port=5180 --strictPort', True),
            ('port prefix 51800', vite(51800), False),
            ('port equals 51800',
             'node /checkouts/w/node_modules/.bin/vite --host 127.0.0.1 --port=51800 --strictPort', False),
            ('strictPortX',
             'node /checkouts/w/node_modules/.bin/vite --host 127.0.0.1 --port 5180 --strictPortX', False),
            ('vite only inside a longer name',
             'node /checkouts/w/node_modules/.bin/notavite --host 127.0.0.1 --port 5180 --strictPort', False),
            ('unclosed quote', 'node /checkouts/w/node_modules/.bin/vite --port 5180 --strictPort "unclosed', False),
        ]
        for name, cmd, owned in cases:
            with self.subTest(case=name):
                result, calls, exists = self.stop(
                    {'pgid': 100, **RECORD}, rows=[(205, 100, cmd)], fields={}, dead_pids={100})
                self.assertEqual(result['ok'], owned)
                self.assertEqual(calls, [(100, signal.SIGTERM)] if owned else [])
                self.assertEqual(exists, not owned)

    def test_sweep_failure_after_term_keeps_state(self):
        result, calls, exists = self.stop(
            {'pgid': 100, **RECORD},
            rows=[(100, 100, CMD), (205, 100, vite(5180))],
            fields={(100, 'lstart='): LS, (100, 'command='): CMD},
            sweep_fail=True)
        self.assertFalse(result['ok'])
        self.assertEqual(calls, [(100, signal.SIGTERM)])
        self.assertTrue(exists)

    def test_sweep_failure_makes_orphan_unclear(self):
        result, calls, exists = self.stop(
            {'pgid': 100, **RECORD}, rows=[(205, 100, vite(5180))], fields={}, dead_pids={100},
            sweep_fail=True)
        self.assertFalse(result['ok'])
        self.assertEqual(result['error'], 'ownership unclear')
        self.assertEqual(calls, [])
        self.assertTrue(exists)

    def test_empty_and_partial_sweeps(self):
        for name, rows, owned in [
            ('empty group', [], False),
            ('partial output with bad row', [(998, 'junk', 'garbage'), (205, 100, vite(5180))], True),
        ]:
            with self.subTest(case=name):
                result, calls, exists = self.stop(
                    {'pgid': 100, **RECORD}, rows=rows, fields={}, dead_pids={100})
                self.assertEqual(result['ok'], owned)
                self.assertEqual(calls, [(100, signal.SIGTERM)] if owned else [])
                self.assertEqual(exists, not owned)


class TrackedTest(unittest.TestCase):
    def tracked(self, entries, rows, fields, dead_pids=()):
        ps = FakePs(rows)
        ps.fields.update(fields)

        def kill(pid, sig):
            if pid in dead_pids:
                raise OSError(3, 'No such process')

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(os.environ, {'WAVE_STATE': tmp}), \
                mock.patch.object(ap, 'subprocess') as sub, \
                mock.patch.object(ap.os, 'kill', side_effect=kill):
            sub.run.side_effect = ps.run
            for name, state in entries.items():
                Path(tmp, f'preview-{name}.json').write_text(json.dumps(state))
            return {s['label']: s['alive'] for s in ap.tracked()}

    def test_alive_reflects_ownership(self):
        entries = {
            'owned': {'label': 'owned', 'pid': 100, 'pgid': 100, 'port': 5180, **RECORD},
            'reused': {'label': 'reused', 'pid': 200, 'pgid': 200, 'port': 5181, 'lstart': LS, 'command': CMD},
            'orphan': {'label': 'orphan', 'pid': 300, 'pgid': 300, 'port': 5182, **RECORD},
        }
        rows = [(100, 100, CMD), (205, 300, vite(5182))]
        fields = {(100, 'lstart='): LS, (100, 'command='): CMD,
                  (200, 'lstart='): OTHER_LS, (200, 'command='): OTHER_CMD}
        self.assertEqual(self.tracked(entries, rows, fields, dead_pids={300}),
                         {'owned': True, 'reused': False, 'orphan': True})


class StopAllTest(unittest.TestCase):
    def test_all_skips_unclear_and_continues(self):
        ps = FakePs([(205, 300, vite(5182))])
        ps.fields = {(100, 'lstart='): LS, (100, 'command='): CMD,
                     (200, 'lstart='): OTHER_LS, (200, 'command='): OTHER_CMD}
        calls = []

        def killpg(pgid, sig):
            calls.append((pgid, sig))
            if sig == signal.SIGTERM:
                ps.rows = []

        def kill(pid, sig):
            if pid == 300:
                raise OSError(3, 'No such process')

        captured = []

        def fake_emit(obj, code=0):
            captured.append((obj, code))
            raise SystemExit(code)

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(os.environ, {'WAVE_STATE': tmp}), \
                mock.patch.object(ap, 'subprocess') as sub, \
                mock.patch.object(ap.os, 'kill', side_effect=kill), \
                mock.patch.object(ap.os, 'killpg', side_effect=killpg), \
                mock.patch.object(ap.time, 'sleep'), \
                mock.patch.object(ap, 'emit', side_effect=fake_emit), \
                mock.patch.object(ap.sys, 'argv', ['app-preview.py', 'stop', '--all']):
            sub.run.side_effect = ps.run
            # 'a' sorts before 'z': the unclear entry must not end the --all loop.
            Path(tmp, 'preview-a-unclear.json').write_text(json.dumps(
                {'label': 'unclear', 'pid': 200, 'pgid': 200, 'port': 5181, 'lstart': LS, 'command': CMD}))
            Path(tmp, 'preview-z-owned.json').write_text(json.dumps(
                {'label': 'owned', 'pid': 300, 'pgid': 300, 'port': 5182, **RECORD}))
            with self.assertRaises(SystemExit) as cm:
                ap.main()
            unclear_kept = Path(tmp, 'preview-a-unclear.json').exists()
            owned_removed = Path(tmp, 'preview-z-owned.json').exists()
        self.assertEqual(cm.exception.code, 0)
        obj, code = captured[0]
        self.assertEqual(code, 0)
        self.assertTrue(obj['ok'])
        self.assertEqual(obj['stopped'], ['owned'])
        self.assertEqual(obj['skipped'], [{'label': 'unclear', 'error': 'ownership unclear'}])
        self.assertEqual(calls, [(300, signal.SIGTERM)])
        self.assertTrue(unclear_kept)
        self.assertFalse(owned_removed)


if __name__ == '__main__':
    unittest.main()
