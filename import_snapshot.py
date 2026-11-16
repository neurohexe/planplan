"""Read the deployed application over SSH without writing to the mini-PC."""

import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
import tarfile


REMOTE_CODE = r'''
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile

root = Path("/home/zomb-vodeyko/PlanFactMVP/app")
expected_top = {"app", "backend"}
if {p.name for p in root.iterdir()} != expected_top:
    raise RuntimeError("Unexpected installation layout")
contents = {}
entries = []
for base, dirs, names in os.walk(root, followlinks=False):
    for name in dirs:
        p = Path(base) / name
        if p.is_symlink() or name in {"node_modules", ".git", ".arc"}:
            raise RuntimeError("Unexpected directory: " + str(p.relative_to(root)))
    for name in names:
        p = Path(base) / name
        rel = p.relative_to(root).as_posix()
        allowed = (
            (rel.startswith("app/") and p.suffix in {".html", ".js", ".css"})
            or rel == "backend/package.json"
            or (rel.startswith("backend/src/") and p.suffix == ".js")
            or (rel.startswith("backend/migrations/") and p.suffix == ".sql")
        )
        if p.is_symlink() or not p.is_file() or not allowed:
            raise RuntimeError("Unexpected file: " + rel)
        before = p.stat()
        data = p.read_bytes()
        after = p.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise RuntimeError("File changed during snapshot: " + rel)
        contents[rel] = data
        entries.append({"path": rel, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
for entry in entries:
    if hashlib.sha256((root / entry["path"]).read_bytes()).hexdigest() != entry["sha256"]:
        raise RuntimeError("Source changed during snapshot: " + entry["path"])
service = subprocess.run(
    ["systemctl", "--user", "show", "ru.planfact.mvp.app.service", "--property=ActiveState,SubState,MainPID,WorkingDirectory"],
    capture_output=True, text=True, timeout=15, check=True,
)
manifest = {
    "schema_version": 1,
    "source_host": "zomb-vodeyko-132.zombie.yandex.net",
    "source_directory": str(root),
    "snapshot_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "service": dict(line.split("=", 1) for line in service.stdout.splitlines() if "=" in line),
    "files": sorted(entries, key=lambda x: x["path"]),
    "excluded_installation_directories": ["backups", "bin", "codes", "config.env", "data", "logs", "pgdata", "run", "systemd"],
}
contents["source-manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
with tarfile.open(fileobj=sys.stdout.buffer, mode="w|gz") as archive:
    for rel, data in sorted(contents.items()):
        info = tarfile.TarInfo(rel)
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
'''


def main():
    destination = Path(__file__).resolve().parent / "snapshot"
    if destination.exists():
        raise SystemExit("Snapshot destination already exists; refusing to overwrite")
    command = [
        "ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
        "-o", "UpdateHostKeys=no", "-o", "IdentityAgent=none",
        "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=12",
        "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
        "-i", "/Users/padolskiye/.ssh/id_ed25519",
        "zomb-vodeyko@zomb-vodeyko-132.zombie.yandex.net",
        "python3 -c " + shlex.quote(REMOTE_CODE),
    ]
    result = subprocess.run(command, capture_output=True, timeout=90)
    if result.returncode:
        # Remote stderr is deliberately not echoed: it could contain secrets.
        raise SystemExit("Remote snapshot failed with exit code " + str(result.returncode))
    if len(result.stdout) > 20_000_000:
        raise SystemExit("Unexpected archive size")
    contents = {}
    with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:gz") as archive:
        for item in archive:
            relative = PurePosixPath(item.name)
            if not item.isfile() or relative.is_absolute() or ".." in relative.parts or item.name in contents:
                raise SystemExit("Unsafe archive member")
            if not relative.parts or relative.parts[0] not in {"app", "backend", "source-manifest.json"}:
                raise SystemExit("Unexpected archive member")
            contents[item.name] = archive.extractfile(item).read()
    manifest = json.loads(contents["source-manifest.json"])
    expected = {item["path"] for item in manifest["files"]}
    if set(contents) != expected | {"source-manifest.json"}:
        raise SystemExit("Manifest does not match archive")
    for item in manifest["files"]:
        data = contents[item["path"]]
        if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise SystemExit("Checksum mismatch: " + item["path"])
    patterns = {
        "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "credential_format": re.compile(r"(?<![A-Za-z0-9_])(?:y[01]_|t[01]_|AQAD-|ghp_|github_pat_|AKIA|sk-proj-)[A-Za-z0-9_/-]{16,}"),
        "literal_credential": re.compile(r"(?i)(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[=:]\s*[\"\'][^\"\'\r\n]{8,}[\"\']"),
    }
    findings = []
    for relative, data in contents.items():
        if relative == "source-manifest.json":
            continue
        for number, line in enumerate(data.decode("utf-8").splitlines(), 1):
            for kind, pattern in patterns.items():
                if pattern.search(line):
                    findings.append({"path": relative, "line": number, "kind": kind})
    destination.mkdir(mode=0o700)
    for relative, data in contents.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    report = {
        "snapshot_directory": str(destination),
        "snapshot_utc": manifest["snapshot_utc"],
        "source_file_count": len(manifest["files"]),
        "source_bytes": sum(item["bytes"] for item in manifest["files"]),
        "checksums_verified": True,
        "service": manifest["service"],
        "possible_secret_locations": findings,
    }
    (destination.parent / "import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
