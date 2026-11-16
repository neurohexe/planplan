"""Устанавливает только собственную задачу копирования дампов; существующие чужие файлы не заменяет."""
import os
import plistlib
import subprocess
from pathlib import Path

home=Path.home()
source=Path(__file__).with_name('pull-minipc-backup.sh')
destination=home/'Library/Application Support/PlanFactMiniPC/pull-minipc-backup.sh'
agent=home/'Library/LaunchAgents/ru.planfact.minipc.pull-backup.plist'
logs=home/'Library/Logs/PlanFactMiniPC'
label='ru.planfact.minipc.pull-backup'
definition={
    'Label':label,'ProgramArguments':['/bin/bash',str(destination)],
    'RunAtLoad':True,'StartInterval':10800,'ProcessType':'Background','Umask':63,
    'StandardOutPath':str(logs/'pull-backup.log'),'StandardErrorPath':str(logs/'pull-backup.log'),
}
if agent.exists() and plistlib.loads(agent.read_bytes()) != definition:
    raise SystemExit('Существующий LaunchAgent отличается от подготовленного: автоматическая замена запрещена.')
if destination.exists() and b'PF_MINIPC_PULL_BACKUP_V1' not in destination.read_bytes():
    raise SystemExit('Существующий скрипт не принадлежит этой задаче: автоматическая замена запрещена.')
for directory in (destination.parent,agent.parent,logs):
    directory.mkdir(parents=True,exist_ok=True)
    # Общую папку LaunchAgents не перенастраиваем.
    if directory != agent.parent: directory.chmod(0o700)
destination.write_bytes(source.read_bytes())
destination.chmod(0o700)
agent.write_bytes(plistlib.dumps(definition))
agent.chmod(0o600)
service=f'gui/{os.getuid()}/{label}'
loaded=subprocess.run(['launchctl','print',service],capture_output=True).returncode==0
if not loaded:
    subprocess.run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(agent)],check=True)
else:
    subprocess.run(['launchctl','kickstart',service],check=True)
print('Установлено копирование дампов на Mac: при входе и раз в 3 часа; сохраняется 48 копий.')
