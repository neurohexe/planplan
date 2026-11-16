import hashlib
import io
import json
import stat
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path


WORK = Path(__file__).resolve().parent
SOURCE = Path('/Users/padolskiye/Documents/PlanFactMVP-code')
ARC_ROOT = WORK.parent / 'arcadia-plan-fact-minipc'
TARGET = ARC_ROOT / 'junk/padolskiye/plan_fact_minipc'
SOURCE_COMMIT = 'c12b612918eecf5808b3019a9451ef0979bab86d'
DEPLOYED_COMMIT = 'ee8fdfc20a5cc584a82f0a8da7ec8f37865b064c'
OLD_ARC_HEAD = '99d68932b4ace4233b3fd828ab4e7d87d63e9c5f'


def run(*args, cwd=SOURCE):
    return subprocess.check_output(args, cwd=cwd, stderr=subprocess.PIPE)


assert run('git', 'rev-parse', 'HEAD').decode().strip() == SOURCE_COMMIT
assert not run('git', 'status', '--porcelain')
assert run('git', 'diff', '--name-only', DEPLOYED_COMMIT, SOURCE_COMMIT).decode().splitlines() == ['MVP-STATUS.md']
assert not run('arc', 'status', '--short', cwd=ARC_ROOT).strip()
info = run('arc', 'info', cwd=ARC_ROOT).decode()
assert f'hash: {OLD_ARC_HEAD}\n' in info
assert f'remote_head: {OLD_ARC_HEAD}\n' in info

archive = run('git', 'archive', SOURCE_COMMIT)
files = {}
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tf:
    for member in tf.getmembers():
        if member.isdir():
            continue
        rel = Path(member.name)
        assert member.isfile() and not rel.is_absolute() and '..' not in rel.parts
        assert not any(p in {'.git', '.sandbox', 'node_modules', '.venv', '__pycache__', 'codes', 'backups', 'pgdata'} for p in rel.parts)
        assert rel.name != 'config.env'
        assert rel.suffix not in {'.sqlite', '.dump', '.key', '.pyc'}
        files[rel.as_posix()] = (tf.extractfile(member).read(), member.mode)
assert len(files) == 278

expected = set(files) | {'README.md', '.arcignore', 'source-manifest.json'}
existing = {p.relative_to(TARGET).as_posix() for p in TARGET.rglob('*') if p.is_file()}
assert not existing - expected, sorted(existing - expected)
for rel in expected:
    path = TARGET / rel
    assert not path.is_symlink()
    assert not any(p.is_symlink() for p in path.parents if p != TARGET.parent)

entries = []
for rel, (data, mode) in sorted(files.items()):
    path = TARGET / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    path.chmod(0o755 if mode & 0o111 else 0o644)
    entries.append({'path': rel, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'mode': '100755' if mode & 0o111 else '100644'})

(TARGET / 'README.md').write_bytes((WORK / 'README.md').read_bytes())
(TARGET / '.arcignore').write_bytes((WORK / 'arcignore').read_bytes())
manifest = {
    'schema_version': 2,
    'source_kind': 'git_workshop',
    'source_commit': SOURCE_COMMIT,
    'deployed_code_commit': DEPLOYED_COMMIT,
    'source_diff_from_deployed': ['MVP-STATUS.md'],
    'imported_at_utc': datetime.now(timezone.utc).isoformat(),
    'arcadia_directory': 'junk/padolskiye/plan_fact_minipc',
    'files': entries,
    'generated_import_files': ['README.md', '.arcignore', 'source-manifest.json'],
    'excluded': ['.git', '.sandbox', 'node_modules', '.venv', '__pycache__', 'working databases', 'access codes', 'config.env', 'logs', 'backups', 'bundles'],
}
(TARGET / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
for entry in entries:
    path = TARGET / entry['path']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']
    assert bool(path.stat().st_mode & stat.S_IXUSR) == (entry['mode'] == '100755')
report = {
    'source_commit': SOURCE_COMMIT,
    'deployed_code_commit': DEPLOYED_COMMIT,
    'source_files': len(entries),
    'total_project_files': len(expected),
    'byte_identical_source_files': len(entries),
    'source_bytes': sum(e['size'] for e in entries),
}
(WORK / 'import-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
