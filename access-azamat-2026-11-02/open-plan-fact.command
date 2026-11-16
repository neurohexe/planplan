#!/bin/sh
set -eu

if ! command -v ssh >/dev/null 2>&1; then
    printf '%s\n' 'Не найден SSH-клиент. Нужен OpenSSH.' >&2
    exit 1
fi

printf '%s\n' \
    'План-факт на мини-ПК — подключение Азамата.' \
    'Нужны корпоративная сеть/VPN и личный SSH-доступ azamatikramov.' \
    'После входа по SSH откройте http://127.0.0.1:18768/ в браузере.' \
    'Введите логин azamatikramov и личный код приложения для мини-ПК.' \
    'Оставьте это окно открытым. Для отключения нажмите Ctrl+C.'

exec ssh -N -T \
    -o PreferredAuthentications=publickey \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o ForwardAgent=no \
    -o StrictHostKeyChecking=ask \
    -o ExitOnForwardFailure=yes \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -L 127.0.0.1:18768:127.0.0.1:18766 \
    azamatikramov@zomb-vodeyko-132.zombie.yandex.net
