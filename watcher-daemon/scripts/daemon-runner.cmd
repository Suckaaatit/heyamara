@echo off
setlocal
set ROOT=%~dp0..
set REPO=%ROOT%\..
set LOGDIR=%REPO%\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

set WATCH_DIR=%REPO%\watched
set DB_PATH=%REPO%\data\rules.db
set LOG_FILE=%LOGDIR%\daemon.log

pushd "%REPO%"
echo [%DATE% %TIME%] Watcher daemon runner starting>>"%LOGDIR%\daemon-runner.log"

:loop
echo [%DATE% %TIME%] Starting daemon>>"%LOGDIR%\daemon-runner.log"
set WATCH_DIR=%WATCH_DIR%
set DB_PATH=%DB_PATH%
set LOG_FILE=%LOG_FILE%
node "%ROOT%\dist\index.js" >>"%LOGDIR%\daemon-stdout.log" 2>&1
echo [%DATE% %TIME%] Daemon exited with code %ERRORLEVEL%>>"%LOGDIR%\daemon-runner.log"
timeout /t 5 /nobreak >nul
goto loop
