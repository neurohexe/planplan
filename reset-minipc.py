"""Run the reviewed reset script; keep newly generated credentials out of tool output."""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["rehearse", "reset"])
parser.add_argument("--accounts", type=Path)
parser.add_argument("--delivery", type=Path)
args = parser.parse_args()
os.umask(0o077)
accounts = json.loads(args.accounts.read_text()) if args.accounts else []
delivery = args.delivery.resolve() if args.delivery else None
if args.mode == "reset":
    if not delivery or delivery.exists():
        raise SystemExit("A new private delivery directory is required")
    delivery.mkdir(mode=0o700)
script = Path(__file__).with_suffix(".cjs").read_text()
remote = (
    '. "$HOME/PlanFactMVP/bin/common.sh"; load_stand_config; '
    'NODE_NO_WARNINGS=1 "$PLAN_FACT_NODE_BIN" --experimental-sqlite - '
    + shlex.quote(args.mode) + " " + shlex.quote(json.dumps(accounts))
)
command = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "UpdateHostKeys=no", "-o", "ConnectTimeout=12",
           "zomb-vodeyko@zomb-vodeyko-132.zombie.yandex.net", "bash -c " + shlex.quote(remote)]
result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=240)
if result.returncode:
    try:
        safe = json.loads(result.stderr.strip().splitlines()[-1])
        safe = {k: safe[k] for k in ("status", "phase", "error_name", "error_code") if k in safe}
    except (ValueError, IndexError):
        safe = {"status": "failed", "exit_code": result.returncode, "details_suppressed": True}
    print(json.dumps(safe, ensure_ascii=False))
    raise SystemExit(result.returncode)
try:
    receipt = json.loads(result.stdout)
except ValueError:
    raise SystemExit("Unexpected response: suppressed to protect credentials; inspect remote state before retrying")
credentials = receipt.pop("credentials", [])
for item in credentials:
    login = item["login"]
    if not login or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in login):
        raise SystemExit("Invalid login in delivery receipt")
    target = delivery / (login + ".txt")
    with target.open("x", encoding="utf-8") as out:
        out.write("План Факт — стенд на мини-ПК\n")
        out.write("Логин: " + login + "\nРоль: " + item["role"] + "\n")
        out.write("Личный код: " + item["code"] + "\n")
        out.write("Храните код лично. Введите его в форму входа приложения.\n")
    os.chmod(target, 0o600)
if delivery:
    receipt["credential_files"] = [str(delivery / (item["login"] + ".txt")) for item in credentials]
print(json.dumps(receipt, ensure_ascii=False))
