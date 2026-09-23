"""This report package only: source preservation, sample fidelity, local links.
Not a product test, semantic approval, or proposed permanent repository framework.
Run: python3 .agents/reports/doc-operations-2026-09-22/validate.py
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
from urllib.parse import unquote

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]

def digest(data):
    return hashlib.sha256(data).hexdigest()

def drift(files):
    return [p for p, h in files.items()
            if not (ROOT / p).is_file() or digest((ROOT / p).read_bytes()) != h]

def section(text):
    return text[text.index('### 6.3 시간 계약'):text.index('### 6.4 URL 계약')]

def copied_section(text):
    return text.split('## 원문 사본 시작\n\n', 1)[1].split('## 원문 사본 끝', 1)[0]

def anchors(text):
    found = set(re.findall(r'<a\s+id="([^"]+)"', text))
    for heading in re.findall(r'^#{1,6}\s+(.+)$', text, re.M):
        slug = re.sub(r'[^\w\-\s]', '', heading.lower()).replace(' ', '-')
        found.add(slug)
    return found

def link_errors(path):
    errors = []
    # Limited inline Markdown paths, not a complete Markdown/renderer parser.
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if re.match(r'^[a-z]+:', target):
            continue
        target = target.strip('<>')
        name, sep, fragment = target.partition('#')
        dest = path.parent / unquote(name) if name else path
        if not dest.exists():
            errors.append({'file': str(path.relative_to(ROOT)), 'target': target, 'reason': 'missing path'})
        elif sep and dest.suffix == '.md' and unquote(fragment) not in anchors(dest.read_text()):
            errors.append({'file': str(path.relative_to(ROOT)), 'target': target, 'reason': 'unresolved heading/explicit anchor'})
    return errors

snapshot = json.loads((BASE / 'source-snapshot.json').read_text())
source = section((ROOT / 'docs/06_platform_ui_contract.md').read_text())
sample = copied_section((BASE / 'sample-time-contract.md').read_text())
negative = {
    'removed_R_absent_exception_detected': source != sample.replace('자동 재집계만 보류한다', '모든 조회를 보류한다'),
    'changed_source_hash_detected': bool(drift({'docs/06_platform_ui_contract.md': '0' * 64})),
    'missing_source_detected': bool(drift({'docs/does-not-exist-docops-check.md': '0' * 64})),
    'missing_anchor_detected': 'does-not-exist-docops-anchor' not in anchors(source),
}
errors = []
for path in sorted(BASE.rglob('*.md')):
    errors.extend(link_errors(path))
manifest_dir = ROOT / 'docs/references/standard-log-lifecycle'
manifest = json.loads((manifest_dir / 'source-manifest.json').read_text())
blob_checks = []
for entry in manifest['files']:
    data = (manifest_dir / 'upstream' / entry['path']).read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    blob_checks.append({'path': entry['path'], 'matches_local_manifest': actual == entry['git_blob_sha']})
result = {
    'scope': 'Report package structural checks only; no runtime or semantic guarantee',
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'baseline_head': snapshot['head'],
    'baseline_files_checked': len(snapshot['files']),
    'source_drift': drift(snapshot['files']),
    'sample_exact_match': source == sample,
    'sample_section_sha256': digest(source.encode()),
    'local_report_link_errors': errors,
    'negative_checks': negative,
    'external_snapshot_local_blob_checks': blob_checks,
    'feedbackops_gitlink': subprocess.check_output(['git', 'ls-files', '--stage', 'products/feedbackops'], cwd=ROOT, text=True).strip(),
}
(BASE / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(1 if result['source_drift'] or not result['sample_exact_match'] or errors or not all(negative.values()) or not all(x['matches_local_manifest'] for x in blob_checks) else 0)
