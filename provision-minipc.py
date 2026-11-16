"""Provision new mini-PC accounts; capture fresh codes privately, never print them."""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["inspect", "provision"])
parser.add_argument("--accounts", required=True, type=Path)
parser.add_argument("--delivery", type=Path)
args = parser.parse_args()
os.umask(0o077)
manifest = json.loads(args.accounts.read_text())
expected = {item["login"]: item["role"] for item in manifest["create"]}
delivery = args.delivery.resolve() if args.delivery else None
if args.mode == "provision":
    if not delivery or delivery.exists():
        raise SystemExit("A new private delivery directory is required")
    delivery.mkdir(mode=0o700)
script = Path(__file__).with_suffix(".cjs").read_text()
remote = (
    'set -e; . "$HOME/PlanFactMVP/bin/common.sh"; load_stand_config; '
    'NODE_NO_WARNINGS=1 "$PLAN_FACT_NODE_BIN" --experimental-sqlite - '
    + shlex.quote(args.mode) + " " + shlex.quote(json.dumps(manifest))
)
command = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "UpdateHostKeys=no", "-o", "ConnectTimeout=12",
           "zomb-vodeyko@zomb-vodeyko-132.zombie.yandex.net", "bash -c " + shlex.quote(remote)]
try:
    result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=180)
except subprocess.TimeoutExpired:
    raise SystemExit("SSH timeout; inspect remote state before retrying. Output suppressed.") from None
try:
    receipt = json.loads(result.stdout)
except (ValueError, TypeError):
    print(json.dumps({"status": "unknown", "exit_code": result.returncode,
                      "details_suppressed": True, "inspect_before_retry": True}))
    raise SystemExit(1) from None
credentials = receipt.pop("credentials", [])
files = []
for item in credentials:
    login = item["login"]
    if login not in expected or item["role"] != expected[login] or not delivery:
        raise SystemExit("Unexpected credential receipt; inspect before retry")
    target = delivery / (login + ".txt")
    with target.open("x", encoding="utf-8") as out:
        out.write("План Факт — стенд на мини-ПК\n")
        out.write("Логин: " + login + "\nРоль: " + item["role"] + "\n")
        out.write("Личный код: " + item["code"] + "\n")
        out.write("Введите логин и личный код в форму входа. Храните код лично.\n")
        out.write("Общая ссылка для коллег пока не настроена; её сообщат отдельно.\n")
        out.flush()
        os.fsync(out.fileno())
    os.chmod(target, 0o600)
    files.append(str(target))
if delivery:
    receipt["credential_files"] = files
    with (delivery / "receipt.json").open("x", encoding="utf-8") as out:
        json.dump(receipt, out, ensure_ascii=False, indent=2)
        out.write("\n")
print(json.dumps(receipt, ensure_ascii=False))
raise SystemExit(result.returncode)
