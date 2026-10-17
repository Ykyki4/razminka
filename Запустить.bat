@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Разминка запущена: http://localhost:8765/
echo Не закрывай это окно, пока играешь. Закроешь — сайт остановится.
start "" "http://localhost:8765/"
where python >nul 2>nul && (python tools\serve.py 8765) || (py tools\serve.py 8765)
pause
