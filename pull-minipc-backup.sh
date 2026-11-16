#!/bin/bash
# PF_MINIPC_PULL_BACKUP_V1
# Копирует только готовый дамп PostgreSQL; содержимое базы и ключей не выводится.
set -euo pipefail
umask 077
target="$HOME/PlanFactMVP-minipc-backups"
host=zomb-vodeyko@zomb-vodeyko-132.zombie.yandex.net
ssh_args=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o IdentityAgent=none -o IdentitiesOnly=yes -o ConnectTimeout=15 -i "$HOME/.ssh/id_ed25519")
mkdir -p "$target"
chmod 700 "$target"
name=$(ssh "${ssh_args[@]}" "$host" 'find "$HOME/PlanFactMVP/backups/postgres/hourly" -maxdepth 1 -type f -name "plan-fact-*.dump" -printf "%f\n" | LC_ALL=C sort | tail -n 1')
[[ "$name" =~ ^plan-fact-[0-9]{8}-[0-9]{6}\.dump$ ]] || { echo 'Не найден готовый дамп PostgreSQL.' >&2; exit 1; }
expected=$(ssh "${ssh_args[@]}" "$host" "sha256sum \"\$HOME/PlanFactMVP/backups/postgres/hourly/$name\"")
expected=${expected%% *}
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || exit 1
temporary=$(mktemp "$target/.pull.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
scp -q "${ssh_args[@]}" "$host:PlanFactMVP/backups/postgres/hourly/$name" "$temporary"
actual=$(shasum -a 256 "$temporary")
[ "${actual%% *}" = "$expected" ] || { echo 'SHA-256 резервной копии не совпал.' >&2; exit 1; }
chmod 600 "$temporary"
mv -f -- "$temporary" "$target/$name"
printf '%s  %s\n' "$expected" "$name" > "$target/$name.sha256"
python3 - "$target" <<'PY'
from pathlib import Path
import sys
copies = sorted(Path(sys.argv[1]).glob('plan-fact-????????-??????.dump'))
for old in copies[:-48]:
    old.unlink()
    old.with_name(old.name + '.sha256').unlink(missing_ok=True)
PY
printf '%s Сохранена %s, SHA-256 подтверждён.\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$name"
