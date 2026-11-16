@echo off
chcp 65001 >nul
where ssh >nul 2>&1
if errorlevel 1 (
    echo Не найден SSH-клиент. Нужен OpenSSH.
    pause
    exit /b 1
)
echo План-факт на мини-ПК — подключение Азамата.
echo Нужны корпоративная сеть/VPN и личный SSH-доступ azamatikramov.
echo После входа по SSH откройте http://127.0.0.1:18768/ в браузере.
echo Введите логин azamatikramov и личный код приложения для мини-ПК.
echo Оставьте это окно открытым. Для отключения нажмите Ctrl+C.
ssh -N -T -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o ForwardAgent=no -o StrictHostKeyChecking=ask -o ExitOnForwardFailure=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:18768:127.0.0.1:18766 azamatikramov@zomb-vodeyko-132.zombie.yandex.net
set "tunnel_result=%ERRORLEVEL%"
if not "%tunnel_result%"=="0" pause
exit /b %tunnel_result%
